import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {createLocalSavedQueueApprovalStore} from './local-saved-queue-approval';

export const localSavedQueueApproval=createLocalSavedQueueApprovalStore(
  SecureStore,
  value=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value)
);
