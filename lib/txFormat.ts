// lib/txFormat.ts — shared transaction display helpers
//
// Used by TransactionCard (Home + Transactions tab) and detail/confirm sheets
// so formatting + "linked profile" detection stays in one place.

import { Transaction } from '@/types';

/** Format ISO timestamp (or Firestore Timestamp) → "3:45 PM · May 28" */
export function fmtTxTime(ts: any, fallbackDate?: string): string {
  if (!ts && !fallbackDate) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts || fallbackDate);
    if (isNaN(d.getTime())) return fallbackDate || '';
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${time} · ${date}`;
  } catch { return fallbackDate || ''; }
}

/**
 * Mirrored Debt/Lent transactions store `linkedRecordId` as
 * "profile:<profileId>:<profileTxId>". Returns the profileId, or null if
 * this transaction isn't linked to a Financial Profile.
 */
export function getLinkedProfileId(tx: Pick<Transaction, 'linkedRecordId'>): string | null {
  if (!tx.linkedRecordId || !tx.linkedRecordId.startsWith('profile:')) return null;
  const parts = tx.linkedRecordId.split(':');
  return parts[1] || null;
}

/**
 * True if `tx` is a Debt/Lent transaction mirrored from a Financial Profile
 * that no longer exists (i.e. the profile was deleted).
 */
export function isOrphanedProfileTx(tx: Pick<Transaction, 'linkedRecordId'>, profileIds: Set<string>): boolean {
  const pid = getLinkedProfileId(tx);
  return !!pid && !profileIds.has(pid);
}
