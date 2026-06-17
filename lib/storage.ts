// lib/storage.ts — AsyncStorage helpers
//
// After the SQLite migration, AsyncStorage is ONLY used for:
//   • preferredCurrency (small preference string)
//   • theme / onboarding flags (future)
//
// All large datasets (wallets, transactions, lending, debts, profiles) live in
// SQLite via lib/database.ts.  Do NOT store arrays here.

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Generic helpers ──────────────────────────────────────────────────────────

export async function storageSet<T>(key: string, value: T): Promise<void> {
  try {
    if (value === undefined || value === null) return;
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.log('[storage] set error:', e);
  }
}

export async function storageGetAsync<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function storageRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.log('[storage] remove error:', e);
  }
}

// ─── Preference hydration (called at startup alongside SQLite hydration) ──────

export async function hydratePreferences(): Promise<{ preferredCurrency?: string }> {
  try {
    const raw = await AsyncStorage.getItem('preferredCurrency');
    if (!raw) return {};
    return { preferredCurrency: JSON.parse(raw) };
  } catch {
    return {};
  }
}
