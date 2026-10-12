import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {createLocalSavedQueueOrderStore} from './local-saved-queue-order';
export const localSavedQueueOrder=createLocalSavedQueueOrderStore(
 SecureStore,value=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value)
);
