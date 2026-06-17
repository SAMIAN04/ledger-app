// modules/widget-bridge/index.ts
//
// TypeScript wrapper around the Android NativeModule "LedgerWidgetBridge".
// On iOS or when running in Expo Go (no native build), all calls are no-ops.
//
// Usage:
//   import { updateWidgetData, getActiveWidgetCount } from '@/modules/widget-bridge';
//   await updateWidgetData(totalLabel, totalValue, walletsJson);

import { NativeModules, Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletPayload {
  id:      string;   // wallet UUID
  name:    string;   // e.g. "Cash Wallet"
  balance: string;   // pre-formatted, e.g. "৳ 5,000"
}

// ─── Module access ────────────────────────────────────────────────────────────

/** The native module — only present on Android production builds. */
const { LedgerWidgetBridge } = NativeModules;

/** True when the native module is available (Android native build, not Expo Go). */
export const isWidgetBridgeAvailable =
  Platform.OS === 'android' && LedgerWidgetBridge != null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Push updated balance data to all active Ledger widget instances.
 *
 * This writes to Android SharedPreferences and calls AppWidgetManager
 * to refresh the widget RemoteViews immediately — no polling needed.
 *
 * @param totalLabel   Label for the total balance, e.g. "Total Balance"
 * @param totalValue   Formatted total, e.g. "৳ 15,450"
 * @param wallets      Array of wallet objects for per-wallet widget configs
 *
 * No-op on iOS or in Expo Go — safe to call unconditionally.
 */
export async function updateWidgetData(
  totalLabel: string,
  totalValue: string,
  wallets: WalletPayload[],
): Promise<void> {
  if (!isWidgetBridgeAvailable) return;
  try {
    await LedgerWidgetBridge.updateWidgetData(
      totalLabel,
      totalValue,
      JSON.stringify(wallets),
    );
  } catch (e) {
    // Widget update failure should never crash the app
    if (__DEV__) console.warn('[WidgetBridge] updateWidgetData failed:', e);
  }
}

/**
 * Returns the number of active Ledger widget instances on the home screen.
 * Useful for skipping the update call when no widget is placed (saves battery).
 * Returns 0 on iOS or in Expo Go.
 */
export async function getActiveWidgetCount(): Promise<number> {
  if (!isWidgetBridgeAvailable) return 0;
  try {
    return await LedgerWidgetBridge.getActiveWidgetCount();
  } catch {
    return 0;
  }
}

/**
 * Sends the app to the background — like pressing the Home button — without
 * killing the process, so in-flight Firestore syncs keep running.
 *
 * Used after a widget-launched modal (Add Transaction / Transfer) closes,
 * so the user sees the modal slide away and their home screen reappear
 * instead of landing inside the full app.
 *
 * No-op on iOS or in Expo Go (resolves to false).
 */
export async function moveTaskToBack(): Promise<boolean> {
  if (!isWidgetBridgeAvailable) return false;
  try {
    return await LedgerWidgetBridge.moveTaskToBack();
  } catch (e) {
    if (__DEV__) console.warn('[WidgetBridge] moveTaskToBack failed:', e);
    return false;
  }
}
