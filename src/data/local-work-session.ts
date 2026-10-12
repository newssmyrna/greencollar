import * as SecureStore from 'expo-secure-store';
import {createLocalWorkSessionStore} from './local-work-session-store';
// Keep one shared queue for all app callers and preserve existing standard operator keys.
const store=createLocalWorkSessionStore(SecureStore);
export const loadWorkSession=store.loadWorkSession;
export const saveWorkSession=store.saveWorkSession;
