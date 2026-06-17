// hooks/useProfiles.ts — Offline-first CRUD for Financial Profiles
//
// Write flow: SQLite → Zustand → queue Firestore
// Same pattern as useFirestore.ts
//
// Every create/update/delete on a profile or profile-transaction is:
//   1. Written to SQLite immediately (offline-safe)
//   2. Reflected in Zustand (instant UI)
//   3. Queued to sync_queue so useSyncEngine flushes it to Firestore

import { useAppStore } from '@/store/useAppStore';
import { useProfilesStore } from '@/store/useProfilesStore';
import {
  dbGetAllProfiles, dbGetProfile, dbInsertProfile, dbUpdateProfile,
  dbDeleteProfile, dbInsertProfileTransaction, dbGetProfileTransactions,
  dbDeleteProfileTransaction, dbRecalculateProfileBalance, initProfilesSchema,
} from '@/lib/profilesDatabase';
import {
  generateId, dbQueueAdd,
  dbInsertTransaction, dbGetAllTransactions,
  dbUpdateWallet, dbGetAllWallets,
} from '@/lib/database';
import { FinancialProfile, ProfileTransaction, ProfileTransactionType } from '@/types/profiles';
import { Transaction } from '@/types';

// Map profile tx types → main Transaction type + human title prefix
const MAIN_TYPE: Record<ProfileTransactionType, Transaction['type']> = {
  borrow:     'debt',
  lend:       'lent',
  repay:      'expense',
  receive:    'income',
  adjustment: 'expense',
  interest:   'expense',
  fee:        'expense',
};
const TITLE_PREFIX: Record<ProfileTransactionType, string> = {
  borrow:     'Borrowed from',
  lend:       'Lent to',
  repay:      'Repaid to',
  receive:    'Received from',
  adjustment: 'Adjustment',
  interest:   'Interest',
  fee:        'Fee',
};

// Build the Firestore-friendly payload for a FinancialProfile
export function profilePayload(p: FinancialProfile) {
  return {
    name: p.name,
    type: p.type,
    phone: p.phone ?? null,
    email: p.email ?? null,
    notes: p.notes ?? null,
    profilePic: p.profilePic ?? null,
    totalBorrowed: p.totalBorrowed ?? 0,
    totalLent: p.totalLent ?? 0,
    totalRepaid: p.totalRepaid ?? 0,
    totalReceived: p.totalReceived ?? 0,
    currentBalance: p.currentBalance ?? 0,
    interestType: p.interestType ?? 'none',
    interestRate: p.interestRate ?? null,
    hasInstallment: p.hasInstallment ?? false,
    loanAmount: p.loanAmount ?? null,
    installmentAmount: p.installmentAmount ?? null,
    installmentDueDay: p.installmentDueDay ?? null,
    loanTermMonths: p.loanTermMonths ?? null,
    reminderDate: p.reminderDate ?? null,
    reminderNote: p.reminderNote ?? null,
    createdAt: p.createdAt,
  };
}

// Build the Firestore-friendly payload for a ProfileTransaction
function profileTxPayload(tx: ProfileTransaction) {
  return {
    profileId: tx.profileId,
    type: tx.type,
    amount: tx.amount,
    walletId: tx.walletId ?? null,
    walletName: tx.walletName ?? null,
    note: tx.note ?? null,
    date: tx.date,
    attachment: tx.attachment ?? null,
    createdAt: tx.createdAt,
  };
}

// Module-level guard — schema is initialised at most once per JS runtime.
// Avoids redundant CREATE TABLE IF NOT EXISTS calls on every profile operation.
let _schemaInitialised = false;

// ── Wallet-effect reversal ──────────────────────────────────────────────────
// Mirrors the wallet balance delta a profile-transaction originally applied,
// negated — i.e. "give the money back". Shared by deleteProfileTransaction
// (single tx) and deleteProfile (all of a profile's transactions at once).
//
//   borrow  : wallet was credited (+amount) when borrowed  → reverse = -amount
//   lend    : wallet was debited  (-amount) when lent      → reverse = +amount
//   repay   : wallet was debited  (-amount) when repaid    → reverse = +amount
//   receive : wallet was credited (+amount) when received  → reverse = -amount
//   adjustment/interest/fee: no wallet effect → 0
export function reversalDelta(tx: ProfileTransaction): number {
  switch (tx.type) {
    case 'borrow':  return -tx.amount;
    case 'lend':    return  tx.amount;
    case 'repay':   return  tx.amount;
    case 'receive': return -tx.amount;
    default:        return 0;
  }
}

export interface ProfileDeletionRefund {
  walletId: string;
  walletName: string;
  currency: string;
  /** Net balance change this wallet will receive (can be + or -) */
  delta: number;
}

export interface ProfileDeletionPreview {
  /** Number of profile transactions that will be removed */
  txCount: number;
  /** Net wallet balance adjustments (one per affected wallet) */
  refunds: ProfileDeletionRefund[];
}

export function useProfiles() {
  const { wallets, setWallets, setTransactions } = useAppStore();
  const { setProfiles, updateProfileInStore, removeProfileFromStore, addProfileToStore } = useProfilesStore();

  // ─── Init ────────────────────────────────────────────────────────────────

  async function ensureSchema() {
    if (_schemaInitialised) return;
    await initProfilesSchema();
    _schemaInitialised = true;
  }

  async function hydrateProfiles() {
    await ensureSchema();
    const profiles = await dbGetAllProfiles();
    setProfiles(profiles);
  }

  // ─── Profile Operations ───────────────────────────────────────────────────

  async function createProfile(data: Omit<FinancialProfile, 'id' | 'totalBorrowed' | 'totalLent' | 'totalRepaid' | 'totalReceived' | 'currentBalance'>): Promise<string> {
    await ensureSchema();
    const id = generateId();
    const now = new Date().toISOString();
    const profile: FinancialProfile = {
      ...data,
      id,
      totalBorrowed: 0,
      totalLent: 0,
      totalRepaid: 0,
      totalReceived: 0,
      currentBalance: 0,
      createdAt: now,
      updatedAt: now,
    };
    // 1. SQLite
    await dbInsertProfile(profile);
    // 2. Zustand
    addProfileToStore(profile);
    // 3. Queue for Firestore sync
    await dbQueueAdd({
      entityType: 'financial_profiles',
      entityId: id,
      operationType: 'ADD',
      payload: profilePayload(profile),
    });
    return id;
  }

  async function updateProfile(id: string, data: Partial<FinancialProfile>): Promise<void> {
    // 1. SQLite
    await dbUpdateProfile(id, data);
    // 2. Zustand
    updateProfileInStore(id, data);
    // 3. Queue for Firestore sync
    const updated = await dbGetProfile(id);
    if (updated) {
      await dbQueueAdd({
        entityType: 'financial_profiles',
        entityId: id,
        operationType: 'UPDATE',
        payload: profilePayload(updated),
      });
    }
  }

  /**
   * Read-only preview of what deleting this profile will do — the net
   * wallet balance adjustments and how many profile transactions will be
   * removed. Used to populate the confirm-delete sheet before the user
   * commits to anything.
   */
  async function getProfileDeletionPreview(profileId: string): Promise<ProfileDeletionPreview> {
    await ensureSchema();
    const profileTxs = await dbGetProfileTransactions(profileId);

    const deltaByWallet = new Map<string, number>();
    for (const tx of profileTxs) {
      if (!tx.walletId) continue;
      const delta = reversalDelta(tx);
      if (delta === 0) continue;
      deltaByWallet.set(tx.walletId, (deltaByWallet.get(tx.walletId) || 0) + delta);
    }

    const refunds: ProfileDeletionRefund[] = [];
    for (const [walletId, delta] of deltaByWallet) {
      if (Math.abs(delta) < 0.005) continue;
      const wallet = wallets.find(w => w.id === walletId);
      refunds.push({
        walletId,
        walletName: wallet?.name || 'Unknown wallet',
        currency: wallet?.currency || 'BDT',
        delta,
      });
    }

    return { txCount: profileTxs.length, refunds };
  }

  /**
   * Delete a Financial Profile and everything tied to it.
   *
   * - Any unsettled debt/lent balance is "refunded" by reversing each of the
   *   profile's transactions on the wallet it touched (same math as
   *   deleteProfileTransaction, applied in bulk) — so the money is merged
   *   back into the wallet it came from / was given from, plus or minus
   *   depending on whether it was debt or lent.
   * - The profile + its profile_transactions rows are removed from SQLite
   *   and Firestore.
   * - Mirrored main `transactions` rows are intentionally LEFT IN PLACE —
   *   the UI detects their now-missing profile via `linkedRecordId` and
   *   renders them disabled with a "Profile deleted" badge.
   */
  async function deleteProfile(id: string): Promise<void> {
    await ensureSchema();

    // 1. Compute + apply wallet refunds for any unsettled amounts
    const profileTxs = await dbGetProfileTransactions(id);
    const deltaByWallet = new Map<string, number>();
    for (const tx of profileTxs) {
      if (!tx.walletId) continue;
      const delta = reversalDelta(tx);
      if (delta === 0) continue;
      deltaByWallet.set(tx.walletId, (deltaByWallet.get(tx.walletId) || 0) + delta);
    }

    if (deltaByWallet.size > 0) {
      for (const [walletId, delta] of deltaByWallet) {
        const wallet = wallets.find(w => w.id === walletId);
        if (!wallet) continue;
        const newBalance = (wallet.balance || 0) + delta;
        await dbUpdateWallet(walletId, { balance: newBalance });
        await dbQueueAdd({ entityType: 'wallets', entityId: walletId, operationType: 'UPDATE', payload: { balance: newBalance } });
      }
      const updatedWallets = await dbGetAllWallets();
      setWallets(updatedWallets);
    }

    // 2. Delete mirrored main-transaction rows for every profile transaction.
    //    Same reasoning as deleteProfileTransaction: these live as a parallel
    //    copy in the main transactions table, not as something Firestore or
    //    SQLite would cascade-delete on its own — without this, removing a
    //    profile leaves its entire transaction history behind as orphaned
    //    ghost entries in the main Transactions tab, with no profile left to
    //    even navigate back from to clean them up.
    const { dbGetAllTransactions, dbDeleteTransaction } = await import('@/lib/database');
    const allTxs = await dbGetAllTransactions();
    let anyMirroredDeleted = false;
    for (const tx of profileTxs) {
      const mirroredTx = allTxs.find(t => t.linkedRecordId === `profile:${id}:${tx.id}`);
      if (mirroredTx) {
        await dbDeleteTransaction(mirroredTx.id);
        await dbQueueAdd({ entityType: 'transactions', entityId: mirroredTx.id, operationType: 'DELETE', payload: {} });
        anyMirroredDeleted = true;
      }
    }
    if (anyMirroredDeleted) {
      const updatedTxs = await dbGetAllTransactions();
      setTransactions(updatedTxs);
    }

    // 3. Queue Firestore deletes for each profile transaction — these live
    //    in a top-level collection, so deleting the parent profile doc
    //    would NOT cascade-delete them.
    for (const tx of profileTxs) {
      await dbQueueAdd({ entityType: 'profile_transactions', entityId: tx.id, operationType: 'DELETE', payload: {} });
    }

    // 4. SQLite (also deletes profile_transactions rows + the profile row)
    await dbDeleteProfile(id);

    // 5. Zustand
    removeProfileFromStore(id);

    // 6. Queue Firestore profile delete
    await dbQueueAdd({
      entityType: 'financial_profiles',
      entityId: id,
      operationType: 'DELETE',
      payload: {},
    });
  }

  async function refreshProfile(id: string): Promise<void> {
    const profile = await dbGetProfile(id);
    if (profile) updateProfileInStore(id, profile);
  }

  // ─── Transaction Operations ────────────────────────────────────────────────

  async function addProfileTransaction(opts: {
    profileId: string;
    type: ProfileTransactionType;
    amount: number;
    walletId?: string;
    note?: string;
    attachment?: string;
  }): Promise<string> {
    await ensureSchema();

    const { profileId, type, amount, walletId, note, attachment } = opts;
    const id = generateId();
    const now = new Date().toISOString();

    // Get wallet + profile name snapshots
    const wallet = wallets.find(w => w.id === walletId);
    const walletName = wallet?.name;
    const profile = useProfilesStore.getState().profiles.find(p => p.id === profileId);
    const personName = profile?.name ?? '';

    const tx: ProfileTransaction = {
      id,
      profileId,
      type,
      amount,
      walletId,
      walletName,
      note,
      date: now,
      attachment,
      createdAt: now,
    };

    // 1. Write to profile transactions (SQLite)
    await dbInsertProfileTransaction(tx);

    // 2. Queue profile transaction to Firestore
    await dbQueueAdd({
      entityType: 'profile_transactions',
      entityId: id,
      operationType: 'ADD',
      payload: profileTxPayload(tx),
    });

    // 3. Update wallet balance if applicable
    if (walletId && wallet) {
      let balanceDelta = 0;
      if (type === 'borrow')  balanceDelta = +amount;
      if (type === 'lend')    balanceDelta = -amount;
      if (type === 'repay')   balanceDelta = -amount;
      if (type === 'receive') balanceDelta = +amount;

      if (balanceDelta !== 0) {
        const newBalance = (wallet.balance || 0) + balanceDelta;
        await dbUpdateWallet(walletId, { balance: newBalance });
        // CRITICAL: must be queued or this balance change never reaches
        // Firestore — it would only live in SQLite and get wiped/overwritten
        // by stale server data on the next sign-out → sign-in cycle.
        await dbQueueAdd({ entityType: 'wallets', entityId: walletId, operationType: 'UPDATE', payload: { balance: newBalance } });
        const updated = await dbGetAllWallets();
        setWallets(updated);
      }
    }

    // 4. Mirror to main transactions so it shows on the Transactions tab.
    //    linkedRecordId stores the profile-transaction id so delete can reverse
    //    the profile state (Bug 2 fix).
    const mainTxId = generateId();
    const titleSuffix = personName ? ` ${personName}` : '';
    const mainTx: Transaction = {
      id: mainTxId,
      type: MAIN_TYPE[type],
      title: `${TITLE_PREFIX[type]}${titleSuffix}`,
      amount,
      walletId: walletId ?? '',
      date: now.slice(0, 10),
      notes: note,
      personName: personName || undefined,
      profilePic: profile?.profilePic ?? null,
      linkedRecordId: `profile:${profileId}:${id}`, // encodes profileId + profileTxId
      createdAt: now,
    };
    await dbInsertTransaction(mainTx, 'pending');
    const updatedTxs = await dbGetAllTransactions();
    setTransactions(updatedTxs);
    await dbQueueAdd({ entityType: 'transactions', entityId: mainTxId, operationType: 'ADD', payload: mainTx });

    // 5. Recalculate profile balance
    await dbRecalculateProfileBalance(profileId);

    // 6. Refresh profile in store + re-queue updated profile to Firestore
    await refreshProfile(profileId);
    const updatedProfile = await dbGetProfile(profileId);
    if (updatedProfile) {
      await dbQueueAdd({
        entityType: 'financial_profiles',
        entityId: profileId,
        operationType: 'UPDATE',
        payload: profilePayload(updatedProfile),
      });
    }

    return id;
  }

  async function deleteProfileTransaction(txId: string, profileId: string, tx: ProfileTransaction): Promise<void> {
    // Reverse wallet effect
    if (tx.walletId) {
      const wallet = wallets.find(w => w.id === tx.walletId);
      if (wallet) {
        const balanceDelta = reversalDelta(tx);

        if (balanceDelta !== 0) {
          const newBalance = (wallet.balance || 0) + balanceDelta;
          await dbUpdateWallet(tx.walletId, { balance: newBalance });
          await dbQueueAdd({ entityType: 'wallets', entityId: tx.walletId, operationType: 'UPDATE', payload: { balance: newBalance } });
          const updated = await dbGetAllWallets();
          setWallets(updated);
        }
      }
    }

    // 1. Delete mirrored main transaction (if it exists).
    //    The linked record id format is "profile:<profileId>:<profileTxId>".
    const { dbGetAllTransactions, dbDeleteTransaction } = await import('@/lib/database');
    const allTxs = await dbGetAllTransactions();
    const mirroredTx = allTxs.find(t => t.linkedRecordId === `profile:${profileId}:${txId}`);
    if (mirroredTx) {
      await dbDeleteTransaction(mirroredTx.id);
      await dbQueueAdd({ entityType: 'transactions', entityId: mirroredTx.id, operationType: 'DELETE', payload: {} });
      const updatedTxs = await dbGetAllTransactions();
      setTransactions(updatedTxs);
    }

    // 2. SQLite delete of profile transaction
    await dbDeleteProfileTransaction(txId, profileId);
    // 3. Queue delete to Firestore
    await dbQueueAdd({
      entityType: 'profile_transactions',
      entityId: txId,
      operationType: 'DELETE',
      payload: {},
    });

    // 4. Recalculate balance
    await dbRecalculateProfileBalance(profileId);
    // 5. Refresh + re-queue updated profile balances
    await refreshProfile(profileId);
    const updatedProfile = await dbGetProfile(profileId);
    if (updatedProfile) {
      await dbQueueAdd({
        entityType: 'financial_profiles',
        entityId: profileId,
        operationType: 'UPDATE',
        payload: profilePayload(updatedProfile),
      });
    }
  }

  async function getProfileTransactions(profileId: string): Promise<ProfileTransaction[]> {
    await ensureSchema();
    return dbGetProfileTransactions(profileId);
  }

  return {
    hydrateProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
    getProfileDeletionPreview,
    addProfileTransaction,
    deleteProfileTransaction,
    getProfileTransactions,
    refreshProfile,
  };
}
