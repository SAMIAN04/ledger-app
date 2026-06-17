// hooks/useSyncEngine.ts — WhatsApp-style offline-first sync engine
//
// Architecture:
//
//   Local write (useFirestore.ts / useProfiles.ts)
//     1. SQLite INSERT/UPDATE/DELETE  ← immediate, offline-safe
//     2. Zustand update              ← UI updates instantly
//     3. sync_queue INSERT           ← logged for later upload
//     → returns UUID to caller immediately (no Firestore wait)
//
//   Background sync (this hook)
//     4. On online/resume/interval: flush sync_queue → Firestore
//     5. onSnapshot merges server changes → SQLite (newest-wins)
//     6. Zustand refreshed from SQLite after merge
//
//   Entities synced:
//     wallets, transactions, lending, debts,
//     financial_profiles, profile_transactions
//
//   Properties:
//     • Fully offline capable — zero Firestore dependency at runtime
//     • Never blocks UI — all Firestore I/O is async background
//     • Data survives crashes — SQLite is ACID, queue persists
//     • Conflict-safe — updated_at timestamps, newest wins
//     • Duplicate-safe — UUID IDs, setDoc instead of addDoc

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db as firestoreDB } from '@/lib/firebase';
import { useAppStore } from '@/store/useAppStore';
import { useProfilesStore } from '@/store/useProfilesStore';
import {
  dbQueueGetPending, dbQueueMarkSynced, dbQueueMarkFailed, dbQueueUnsyncedCount,
  dbBatchUpsertFromServer, hydrateFromSQLite,
} from '@/lib/database';
import { dbGetAllProfiles, dbGetProfileTransactions, dbRecalculateProfileBalance } from '@/lib/profilesDatabase';

// ─── Firestore path helpers ───────────────────────────────────────────────────

function userCol(uid: string, col: string) {
  return collection(firestoreDB, 'users', uid, col);
}
function userDoc(uid: string, col: string, id: string) {
  return doc(firestoreDB, 'users', uid, col, id);
}

// ─── Timestamp normaliser ─────────────────────────────────────────────────────
// Firestore Timestamps arrive as { seconds, nanoseconds } objects.
// Convert to ISO strings at the Firestore→SQLite boundary so SQLite can
// store and compare them without any Timestamp class methods.

function normaliseTimestamps(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof v.seconds === 'number' &&
      typeof v.nanoseconds === 'number'
    ) {
      out[k] = new Date(v.seconds * 1000 + v.nanoseconds / 1_000_000).toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mapDoc(d: any): any {
  return { id: d.id, ...normaliseTimestamps(d.data()) };
}

// ─── Standalone pre-signout flush ─────────────────────────────────────────────
//
// Flushes ALL pending sync_queue items to Firestore before the user's local
// SQLite data is erased. Called by the sign-out handler in profile.tsx so that
// offline writes (made while the device had no network) are not silently lost
// when clearAllUserData() deletes the sync_queue table.
//
// Races against a timeout so sign-out never blocks indefinitely.
//
export interface SignOutFlushResult {
  /** True only if the sync queue is CONFIRMED empty (re-checked after the attempt). */
  fullySynced: boolean;
  /** How many sync_queue items are still unsynced when this returns. */
  remaining: number;
}

export async function flushSyncQueueForSignOut(uid: string, timeoutMs = 15000): Promise<SignOutFlushResult> {
  const netState = await NetInfo.fetch().catch(() => null);
  const isOnline = !!(netState?.isConnected && netState?.isInternetReachable);

  if (isOnline) {
    const pending = await dbQueueGetPending().catch(() => []);

    const flushAll = async () => {
      for (const item of pending) {
        try {
          if (item.operationType === 'ADD') {
            await setDoc(userDoc(uid, item.entityType, item.entityId), {
              ...item.payload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (item.operationType === 'UPDATE') {
            await setDoc(
              userDoc(uid, item.entityType, item.entityId),
              { ...item.payload, updatedAt: serverTimestamp() },
              { merge: true },
            );
          } else if (item.operationType === 'DELETE') {
            await deleteDoc(userDoc(uid, item.entityType, item.entityId));
          }
          await dbQueueMarkSynced(item.id).catch(() => {});
        } catch (e) {
          await dbQueueMarkFailed(item.id).catch(() => {});
          console.warn('[sync] pre-signout flush failed for', item.entityId, e);
        }
      }
    };

    // Race against a timeout so sign-out never hangs indefinitely. Either
    // way, we fall through to the verification step below — nothing here
    // is trusted blindly.
    await Promise.race([
      flushAll(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  // The only thing that matters: what does the queue ACTUALLY look like now?
  // This re-check is what makes the result trustworthy regardless of offline
  // status, timeout, or partial failures above.
  const remaining = await dbQueueUnsyncedCount().catch(() => Number.MAX_SAFE_INTEGER);
  return { fullySynced: remaining === 0, remaining };
}

// ─── Sync engine hook ─────────────────────────────────────────────────────────

export function useSyncEngine() {
  const {
    uid,
    hydrated,
    setSyncStatus,
    setWallets,
    setTransactions,
    setLending,
    setDebts,
  } = useAppStore();
  const { setProfiles } = useProfilesStore();

  const unsubRefs   = useRef<Array<() => void>>([]);
  const isOnlineRef = useRef(false);
  const isFlushing  = useRef(false);

  // ── Refresh Zustand from SQLite (called after any SQLite merge) ───────────
  async function refreshFromSQLite() {
    const data = await hydrateFromSQLite();
    setWallets(data.wallets);
    setTransactions(data.transactions);
    setLending(data.lending);
    setDebts(data.debts);
  }

  async function refreshProfilesFromSQLite() {
    try {
      const profiles = await dbGetAllProfiles();
      setProfiles(profiles);
    } catch {
      // profiles table may not be initialised yet on first boot
    }
  }

  // ── Flush sync queue → Firestore ──────────────────────────────────────────
  // Processes ALL pending queue items in order.
  // Uses setDoc (not addDoc) to guarantee same UUID in Firestore as in SQLite.
  async function flushQueue() {
    if (!uid || !isOnlineRef.current || isFlushing.current) return;
    isFlushing.current = true;

    const pending = await dbQueueGetPending();
    if (!pending.length) {
      isFlushing.current = false;
      return;
    }

    setSyncStatus('syncing', 'Syncing…');

    let anyFailed = false;
    for (const item of pending) {
      try {
        if (item.operationType === 'ADD') {
          // setDoc with the entity's UUID — same ID in both SQLite and Firestore
          await setDoc(userDoc(uid, item.entityType, item.entityId), {
            ...item.payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (item.operationType === 'UPDATE') {
          // setDoc+merge: safe even if ADD never reached Firestore (network crash)
          await setDoc(
            userDoc(uid, item.entityType, item.entityId),
            { ...item.payload, updatedAt: serverTimestamp() },
            { merge: true },
          );
        } else if (item.operationType === 'DELETE') {
          await deleteDoc(userDoc(uid, item.entityType, item.entityId));
        }
        await dbQueueMarkSynced(item.id);
      } catch (e) {
        console.warn('[sync] flush failed for', item.id, e);
        await dbQueueMarkFailed(item.id);
        anyFailed = true;
      }
    }

    isFlushing.current = false;

    if (anyFailed) {
      setSyncStatus('failed', 'Sync Failed');
    } else {
      setSyncStatus('synced', 'Synced');
    }
  }

  // ── Network listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable);
      isOnlineRef.current = online;
      if (!online) {
        setSyncStatus('offline', 'Offline');
      } else if (uid) {
        // Back online — flush any queued writes
        flushQueue();
      }
    });
    return () => unsub();
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Periodic flush ───────────────────────────────────────────────────────
  // Belt-and-suspenders for the network listener above: without this, a
  // write queued while the connection stays continuously up (no online/
  // offline transition at all) has no trigger to ever attempt sending until
  // the next network blip or app restart. A short interval guarantees every
  // pending write gets retried within a bounded window regardless of network
  // event timing. flushQueue() already no-ops if offline, unauthenticated,
  // or already running, so this is safe to fire on a steady cadence.
  useEffect(() => {
    if (!uid) return;
    const interval = setInterval(() => {
      if (isOnlineRef.current) flushQueue();
    }, 20000);
    return () => clearInterval(interval);
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── App-foreground flush ────────────────────────────────────────────────
  // Catches the common mobile pattern of "make a change, immediately switch
  // apps" — a flush that was about to run or was interrupted by backgrounding
  // gets another chance the moment the user returns.
  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isOnlineRef.current) flushQueue();
    });
    return () => sub.remove();
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Firestore real-time listeners ─────────────────────────────────────────
  //
  // Unlike the old architecture (which used onSnapshot to replace Zustand state
  // directly), these listeners:
  //   1. Receive server data
  //   2. Merge into SQLite via dbBatchUpsertFromServer (newest-wins, respects
  //      pending local writes)
  //   3. Refresh Zustand from SQLite
  //
  // This ensures SQLite is always the source of truth — Firestore is secondary.
  //
  // Empty-cache guard: if snap.docs is empty AND fromCache=true, the Firestore
  // in-memory cache has nothing (app just started, memory flushed). Don't
  // overwrite good SQLite data with an empty in-memory snapshot.

  useEffect(() => {
    if (!uid || !hydrated) return;

    unsubRefs.current.forEach((u) => u());
    unsubRefs.current = [];
    setSyncStatus('syncing', 'Syncing…');

    // 6 collections: 4 core + 2 profile collections
    let loaded = 0;
    const total = 6;
    const check = () => { loaded++; if (loaded >= total) setSyncStatus('synced', 'Synced'); };

    const q = (col: string) =>
      query(userCol(uid, col), orderBy('createdAt', 'desc'));

    const makeListener = (
      col: 'wallets' | 'transactions' | 'lending' | 'debts',
    ) =>
      onSnapshot(
        q(col),
        async (snap) => {
          // Skip empty in-memory cache snapshots (don't overwrite good SQLite data)
          if (snap.docs.length === 0 && snap.metadata.fromCache) {
            check();
            return;
          }

          const serverDocs = snap.docs.map(mapDoc);

          // Merge server docs into SQLite with conflict resolution
          const didUpdate = await dbBatchUpsertFromServer(col, serverDocs).catch(() => false);

          // If anything changed in SQLite, refresh Zustand
          if (didUpdate) {
            await refreshFromSQLite();
          }

          check();
        },
        (err) => {
          console.warn('[sync] snapshot error', err.code);
          setSyncStatus('offline', 'Offline');
          check();
        },
      );

    // ── Profile collections listener ────────────────────────────────────────
    // financial_profiles: each doc is a profile, ordered by createdAt
    const makeProfileListener = (
      col: 'financial_profiles' | 'profile_transactions',
    ) =>
      onSnapshot(
        q(col),
        async (snap) => {
          if (snap.docs.length === 0 && snap.metadata.fromCache) {
            check();
            return;
          }

          const serverDocs = snap.docs.map(mapDoc);

          const didUpdate = await dbBatchUpsertFromServer(col, serverDocs).catch(() => false);

          if (didUpdate) {
            if (col === 'profile_transactions') {
              // After syncing profile transactions, recalculate balances for affected profiles
              const affectedProfileIds = [...new Set(serverDocs.map((d: any) => d.profileId).filter(Boolean))];
              for (const pid of affectedProfileIds) {
                await dbRecalculateProfileBalance(pid).catch(() => {});
              }
            }
            await refreshProfilesFromSQLite();
          }

          check();
        },
        (err) => {
          console.warn('[sync] profile snapshot error', err.code);
          check();
        },
      );

    unsubRefs.current = [
      makeListener('wallets'),
      makeListener('transactions'),
      makeListener('lending'),
      makeListener('debts'),
      makeProfileListener('financial_profiles'),
      makeProfileListener('profile_transactions'),
    ];

    // Also flush any pending queue items now that we're authenticated
    flushQueue();

    return () => {
      unsubRefs.current.forEach((u) => u());
    };
  }, [uid, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  return { flushQueue };
}
