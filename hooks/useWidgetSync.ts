// hooks/useWidgetSync.ts
//
// Watches the Zustand wallet store and synchronises balance data to the
// Android home screen widget whenever wallets or currency preference change.
//
// Design goals:
//   • Zero overhead on iOS (returns immediately)
//   • Zero overhead when no widget is placed (widget count check)
//   • Debounced to avoid hammering SharedPreferences on rapid state changes
//   • Never blocks the UI thread
//   • RAM-efficient: no in-memory copies beyond what Zustand already holds
//
// Used in:  app/_layout.tsx  (AuthGate, so it runs for every authenticated session)

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import { updateWidgetData, getActiveWidgetCount, WalletPayload } from '@/modules/widget-bridge';
import { getCurrencySymbol, convertToPreferred } from '@/lib/currency';
import { sortWallets } from '@/utils/walletSort';
import { Wallet } from '@/types';

// Debounce delay in ms — long enough to batch rapid wallet updates,
// short enough to feel instant to the user
const DEBOUNCE_MS = 400;

export function useWidgetSync() {
  const wallets           = useAppStore((s) => s.wallets);
  const preferredCurrency = useAppStore((s) => s.preferredCurrency);
  const hydrated          = useAppStore((s) => s.hydrated);

  // Track whether we've checked for active widgets (avoids repeated async calls)
  const widgetCount      = useRef<number>(0);
  const widgetChecked    = useRef(false);
  const debounceTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // No widget support on iOS — skip entirely
    if (Platform.OS !== 'android') return;
    // Don't sync before SQLite hydration completes
    if (!hydrated) return;

    // Clear any pending debounced sync
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      syncToWidget(wallets, preferredCurrency, widgetCount, widgetChecked);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [wallets, preferredCurrency, hydrated]);
}

// ─── Sync logic ───────────────────────────────────────────────────────────────

async function syncToWidget(
  rawWallets: Wallet[],
  preferredCurrency: string,
  widgetCountRef: React.MutableRefObject<number>,
  widgetCheckedRef: React.MutableRefObject<boolean>,
) {
  try {
    // Check active widget count once per app session to avoid unnecessary work.
    // Re-check every 10 calls to handle widget being added/removed.
    if (!widgetCheckedRef.current || (widgetCountRef.current === 0)) {
      widgetCountRef.current   = await getActiveWidgetCount();
      widgetCheckedRef.current = true;
    }

    // Skip if no widgets are on the home screen — saves battery/RAM
    if (widgetCountRef.current === 0) return;

    const wallets = sortWallets(rawWallets);
    const symbol  = getCurrencySymbol(preferredCurrency);

    // ── Calculate total balance across all wallets ──────────────────────────
    const totalBalance = wallets.reduce(
      (sum, w) => sum + convertToPreferred(w.balance || 0, w.currency || 'BDT', preferredCurrency),
      0,
    );
    const totalValue = `${symbol}\u00A0${formatNumber(totalBalance)}`;
    const totalLabel = 'Total Balance';

    // ── Build per-wallet payload ────────────────────────────────────────────
    const walletPayloads: WalletPayload[] = wallets.map((w) => {
      const converted = convertToPreferred(w.balance || 0, w.currency || 'BDT', preferredCurrency);
      return {
        id:      w.id,
        name:    w.name || 'Wallet',
        balance: `${symbol}\u00A0${formatNumber(converted)}`,
      };
    });

    await updateWidgetData(totalLabel, totalValue, walletPayloads);

    // After a successful sync, re-check count on next call (widget might have been added)
    widgetCheckedRef.current = false;
  } catch (e) {
    if (__DEV__) console.warn('[useWidgetSync] sync failed:', e);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number with commas, up to 2 decimal places, trimming trailing zeros. */
function formatNumber(n: number): string {
  if (isNaN(n) || !isFinite(n)) return '0';
  return Number(n.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
