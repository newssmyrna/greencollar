import React, { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { ClerkProvider, useAuth, useClerk } from '@clerk/expo';
import { useHostedAuth } from '@clerk/expo/hosted-auth';
import { tokenCache } from '@clerk/expo/token-cache';
import { fetchDayData, type DayData } from './src/data/greencollar-api';
import { summarizeSavedDay } from './src/data/saved-day';
import {createSavedQueueReview,canApproveSavedQueueReview,isSavedQueueApproved,savedQueueApprovalAction} from './src/domain/saved-queue-review';
import {describeSavedQueueAppointments,describeAppointmentCheckAssumptions} from './src/domain/saved-queue-appointments';
import {assessServiceWorkload} from './src/domain/service-workload';
import {describeSavedQueueWorkload,type SavedQueueWorkloadLimits} from './src/domain/saved-queue-workload';
import {orderSavedQueue,moveSavedQueueVisit,type SavedQueueOrder,type SavedQueueTravelEstimate} from './src/domain/saved-queue-order';
import {localSavedQueueOrder} from './src/data/local-saved-queue-order-native';
import {localSavedQueueWorkload} from './src/data/local-saved-queue-workload-native';
import {createSavedQueueWorkloadSettings,workloadSettingsHaveUnsavedChanges,workloadSettingsReadyForApproval} from './src/data/saved-queue-workload-settings';
import {localSavedQueueApproval} from './src/data/local-saved-queue-approval-native';
import { getBusinesses, createBusiness } from './src/data/business-api';
import { listSavedCustomers, createSavedCustomer, type SavedCustomer } from './src/data/customer-api';
import { pauseWork, resumeWork, completeWork, completionRecord, type WorkSession } from './src/domain/work-session';
import {canStartNextWork,startNextWork,hasSavedWorkCompletion,workSessionDate} from './src/domain/work-handoff';
import {normalizeWorkNote,withWorkNote} from './src/domain/work-note';
import {saveVisitCompletion} from './src/data/visit-completion';
import {saveVisitSkip} from './src/data/visit-skip';
import {billableCompletedServices,unbillableCompletedServiceCount} from './src/domain/completed-invoice';
import {invoiceTotals,setInvoiceDueDays,setInvoiceTaxBasisPoints} from './src/domain/invoice';
import {listInvoiceDrafts,createPersistedInvoiceDraft,savePersistedInvoiceDraft,type PersistedInvoiceDraft} from './src/data/invoice-draft-api';
import {timerDisplay,createForegroundTimerTicker} from './src/domain/timer-display';
import {completionReviewKey,isCompletionReviewConfirmed} from './src/domain/completion-review';
import {createDurableTimerTransition} from './src/domain/durable-timer-transition';
import {loadWorkSession,saveWorkSession} from './src/data/local-work-session';
import {listServiceLocations,createServiceLocation,type SavedServiceLocation} from './src/data/service-location-api';
import {listServiceAgreements,createServiceAgreement,type SavedServiceAgreement} from './src/data/service-agreement-api';
import {dollarsToCents,localCalendarDate} from './src/domain/service-agreement';
import {parseServiceClock,describeServiceTimeConstraints} from './src/domain/service-time';
import {generateDueVisits,type Frequency} from './src/domain/recurrence';
import {assessProximity,createLocationConfirmation,type ProximityAssessment,type LocationConfirmation} from './src/domain/location-assist';
import {loadLocationConfirmations,saveLocationConfirmation,markLocationConfirmationSynced,pendingLocationConfirmations,type StoredLocationConfirmation} from './src/data/local-location-confirmations';
import {listLocationConfirmations,syncLocationConfirmation,type ServerLocationConfirmation} from './src/data/location-confirmation-api';
import {filterLocationConfirmations,type LocationConfirmationKindFilter,type LocationConfirmationSourceFilter} from './src/domain/location-confirmation-filter';
import {
  SafeAreaView, ScrollView, View, Text, TextInput, AppState,
  Pressable, StyleSheet, StatusBar, Alert
} from 'react-native';

type Customer = {
  id: number;
  name: string;
  address: string;
  service: string;
  rate: number;
  minutes: number;
  notes: string;
};

const seed: Customer[] = [
  { id: 1, name: 'Jordan Smith', address: 'Edgewater, FL', service: 'Exterior maintenance', rate: 65, minutes: 45, notes: 'Close side gate.' },
  { id: 2, name: 'Morgan Davis', address: 'New Smyrna Beach, FL', service: 'Pool service', rate: 80, minutes: 35, notes: 'Call before arrival.' },
  { id: 3, name: 'Casey Johnson', address: 'Port Orange, FL', service: 'Cleaning', rate: 110, minutes: 90, notes: 'Use rear entrance.' },
];
const green = '#183d2b';
const pale = '#d5f48b';

function savedQueueTravelKey(fromVisitId:string|null,toVisitId:string):string{
  return JSON.stringify([fromVisitId,toVisitId]);
}
function parseTravelMinutesDraft(value:string):number|undefined{
  const normalized=value.trim();
  if(!normalized)return undefined;
  if(!/^\d{1,4}$/.test(normalized))return NaN;
  const minutes=Number(normalized);
  return Number.isSafeInteger(minutes)&&minutes<=1440?min