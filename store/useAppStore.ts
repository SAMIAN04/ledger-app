// store/useAppStore.ts — Zustand in-memory cache
//
// Data flow:
//   SQLite (source of truth)
//     ↓  hydrateFromSQLite() at startup
//   Zustand (in-memory, what UI reads)
//     ↓  setWallets/setTransactions/etc. on every write
//   UI renders instantly from Zustand
//
// Setters do NOT write to AsyncStorage — SQLite is the persistence layer.

import { create } from 'zustand';
import { storageSet } from '@/lib/storage';
import {
  Wallet, Transaction, LendingRecord, DebtRecord,
  UserProfile, SyncStatus, FilterPeriod, TxTypeFilter,
} from '@/types';

interface AppState {
  // ── Auth ──────────────────────────────────────────────────────────────────
  uid: string | null;
  user: UserProfile;
  setUid: (uid: string | null) => void;
  setUser: (user: Partial<UserProfile>) => void;

  // ── Data (populated from SQLite at startup) ───────────────────────────────
  wallets: Wallet[];
  transactions: Transaction[];
  lending: LendingRecord[];
  debts: DebtRecord[];
  setWallets: (w: Wallet[]) => void;
  setTransactions: (t: Transaction[]) => void;
  setLending: (l: LendingRecord[]) => void;
  setDebts: (d: DebtRecord[]) => void;

  // ── UI State ──────────────────────────────────────────────────────────────
  page: string;
  filterPeriod: FilterPeriod;
  filterCategory: string;
  txTypeFilter: TxTypeFilter;
  addTxType: 'income' | 'expense' | 'debt' | 'lent';
  preferredCurrency: string;
  syncStatus: SyncStatus;
  syncLabel: string;

  setPage: (p: string) => void;
  setFilterPeriod: (p: FilterPeriod) => void;
  setFilterCategory: (c: string) => void;
  setTxTypeFilter: (t: TxTypeFilter) => void;
  setAddTxType: (t: 'income' | 'expense' | 'debt' | 'lent') => void;
  setPreferredCurrency: (c: string) => void;
  setSyncStatus: (s: SyncStatus, label: string) => void;

  // ── Boot gates ────────────────────────────────────────────────────────────
  // hydrated: SQLite read is done; Firestore listeners can attach.
  // authReady: onAuthStateChanged fired at least once; index.tsx can redirect.
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  authReady: boolean;
  setAuthReady: (v: boolean) => void;

  // True for the lifetime of a single widget-launched session — set by
  // widget-*.tsx gate screens, consumed (and cleared) by the modal they
  // open once it's dismissed, which then sends the app back to the
  // background via WidgetBridge.moveTaskToBack().
  launchedFromWidget: boolean;
  setLaunchedFromWidget: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  uid: null,
  user: { name: '', email: '', profilePic: null, preferredCurrency: 'BDT' },
  setUid: (uid) => set({ uid }),
  setUser: (user) => set((s) => ({ user: { ...s.user, ...user } })),

  wallets: [],
  transactions: [],
  lending: [],
  debts: [],
  setWallets: (wallets) => set({ wallets }),
  setTransactions: (transactions) => set({ transactions }),
  setLending: (lending) => set({ lending }),
  setDebts: (debts) => set({ debts }),

  page: 'home',
  filterPeriod: 'month',
  filterCategory: 'all',
  txTypeFilter: 'all',
  addTxType: 'expense',
  preferredCurrency: 'BDT',
  syncStatus: 'offline',
  syncLabel: 'Offline',

  setPage: (page) => set({ page }),
  setFilterPeriod: (filterPeriod) => set({ filterPeriod }),
  setFilterCategory: (filterCategory) => set({ filterCategory }),
  setTxTypeFilter: (txTypeFilter) => set({ txTypeFilter }),
  setAddTxType: (addTxType) => set({ addTxType }),
  setPreferredCurrency: (preferredCurrency) => {
    if (!preferredCurrency || typeof preferredCurrency !== 'string') return;
    set({ preferredCurrency });
    storageSet('preferredCurrency', preferredCurrency);
  },
  setSyncStatus: (syncStatus, syncLabel) => set({ syncStatus, syncLabel }),

  hydrated: false,
  setHydrated: (hydrated) => set({ hydrated }),
  authReady: false,
  setAuthReady: (authReady) => set({ authReady }),

  launchedFromWidget: false,
  setLaunchedFromWidget: (launchedFromWidget) => set({ launchedFromWidget }),
}));
