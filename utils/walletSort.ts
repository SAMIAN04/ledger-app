// utils/walletSort.ts — single source of truth for wallet ordering
//
// All screens that display wallets must import and use sortWallets().
// Never duplicate this comparator elsewhere.

import { Wallet } from '@/types';

/**
 * Sort wallets by orderIndex ascending, then by createdAt ascending as a
 * stable tie-breaker so newly-created wallets without an orderIndex appear
 * at the end in creation order.
 */
export function sortWallets(wallets: Wallet[]): Wallet[] {
  return [...wallets].sort((a, b) => {
    const oa = a.orderIndex ?? 999999;
    const ob = b.orderIndex ?? 999999;
    if (oa !== ob) return oa - ob;
    // Tie-break by createdAt
    const ca = a.createdAt ? String(a.createdAt) : '';
    const cb = b.createdAt ? String(b.createdAt) : '';
    return ca.localeCompare(cb);
  });
}
