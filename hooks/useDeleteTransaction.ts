// hooks/useDeleteTransaction.ts — Single source of truth for transaction deletion.
//
// Previously every screen (home, transactions, wallet-detail) duplicated this
// logic independently — with slight differences that caused bugs. Now they all
// call this hook.
//
// Delete flow:
//   1. Transfer → delegate to fbDeleteTransfer (reverses both wallet balances)
//   2. Non-transfer → reverse source wallet balance
//   3. If linkedRecordId:
//        "profile:<profileId>:<profileTxId>" → delete profile tx + recalc balance
//        legacy direct id                    → delete lending / debts record
//   4. Delete the main transaction document
//   5. Call onDone() so the caller can close its modal / clear selection

import { useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useFirestore } from '@/hooks/useFirestore';
import { dbQueueAdd } from '@/lib/database';
import {
  dbDeleteProfileTransaction,
  dbRecalculateProfileBalance,
  dbGetProfile,
} from '@/lib/profilesDatabase';
import { profilePayload } from '@/hooks/useProfiles';
import { useProfilesStore } from '@/store/useProfilesStore';

export function useDeleteTransaction() {
  const { fbDelete, fbUpdate, fbDeleteTransfer } = useFirestore();

  const deleteTransaction = useCallback(async (
    txId: string,
    onDone?: () => void,
  ): Promise<void> => {
    // Always read fresh state so stale closures can't cause incorrect balance reversals.
    const { transactions, wallets, lending, debts } = useAppStore.getState();
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    // ── Transfer: reverse both sides via dedicated helper ───────────────────
    if (tx.type === 'transfer') {
      await fbDeleteTransfer(txId);
      onDone?.();
      return;
    }

    // ── Reverse source-wallet balance ───────────────────────────────────────
    const wallet = wallets.find(w => w.id === tx.walletId);
    if (wallet) {
      let newBalance = wallet.balance || 0;
      if (tx.type === 'income')       newBalance -= tx.amount;
      else if (tx.type === 'expense') newBalance += tx.amount;
      else if (tx.type === 'lent')    newBalance += tx.amount;
      else if (tx.type === 'debt')    newBalance -= tx.amount;
      await fbUpdate('wallets', wallet.id, { balance: newBalance });
    }

    // ── Handle linked record ────────────────────────────────────────────────
    if (tx.linkedRecordId) {
      if (tx.linkedRecordId.startsWith('profile:')) {
        // New format written by addProfileTransaction():
        // "profile:<profileId>:<profileTxId>"
        const [, profileId, profileTxId] = tx.linkedRecordId.split(':');
        if (profileId && profileTxId) {
          await dbDeleteProfileTransaction(profileTxId, profileId);
          // CRITICAL: without this, the deleted profile transaction is never
          // told to Firestore — the next snapshot merge has no tombstone to
          // check against and silently re-inserts it back into SQLite.
          await dbQueueAdd({ entityType: 'profile_transactions', entityId: profileTxId, operationType: 'DELETE', payload: {} });

          await dbRecalculateProfileBalance(profileId);
          const updated = await dbGetProfile(profileId);
          if (updated) {
            useProfilesStore.getState().updateProfileInStore(profileId, updated);
            // Recalculated totals (currentBalance, totalBorrowed, etc.) also
            // need to reach Firestore, or the profile's "You Owe / Owes You"
            // figure reverts to its pre-delete value after sign-out/sign-in.
            await dbQueueAdd({
              entityType: 'financial_profiles',
              entityId: profileId,
              operationType: 'UPDATE',
              payload: profilePayload(updated),
            });
          }
        }
      } else if (tx.type === 'lent') {
        // Legacy format: direct lending collection doc id
        const linked = lending.find(l => l.id === tx.linkedRecordId);
        if (linked) await fbDelete('lending', linked.id);
      } else if (tx.type === 'debt') {
        // Legacy format: direct debts collection doc id
        const linked = debts.find(d => d.id === tx.linkedRecordId);
        if (linked) await fbDelete('debts', linked.id);
      }
    }

    // ── Delete the main transaction ─────────────────────────────────────────
    await fbDelete('transactions', txId);
    onDone?.();
  }, [fbDelete, fbUpdate, fbDeleteTransfer]);

  return { deleteTransaction };
}
