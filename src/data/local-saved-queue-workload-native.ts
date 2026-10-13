import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {createLocalSavedQueueWorkloadStore} from './local-saved-queue-workload';

export const localSavedQueueWorkload=createLocalSavedQueueWorkloadStore(
  SecureStore,value=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value)
);
