import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { FIRESTORE_DATABASE_ID, firebaseConfig } from './config';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);

// Persistent sessions: the user stays signed in across reloads and browser restarts.
void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
