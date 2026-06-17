import { initializeApp, getApps } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCkYl3o-CSsib6WS4FnMNT9_VaFZ4cYjmU',
  authDomain: 'expense-tracker-eddf7.firebaseapp.com',
  projectId: 'expense-tracker-eddf7',
  storageBucket: 'expense-tracker-eddf7.firebasestorage.app',
  messagingSenderId: '117496106487',
  appId: '1:117496106487:web:b53876967bf02714bbb2f2',
};

const app =
  getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };

// ─── Firestore setup ───────────────────────────────────────────────────────
// IMPORTANT: persistentLocalCache requires IndexedDB — a Web-only browser API.
// It silently fails in React Native, so we use plain initializeFirestore with
// memory-only state. The manual SQLite layer in lib/database.ts handles all
// offline reads and writes.

let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    // No localCache option — avoids the IndexedDB trap.
    // Offline reads/writes are handled by SQLite (lib/database.ts).
  });
} catch {
  // Only reaches here on hot-reload double-init in dev.
  db = getFirestore(app);
}

export { db };