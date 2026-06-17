export interface Wallet {
  id: string;
  name: string;
  type: 'cash' | 'mobile' | 'bank' | 'card' | 'savings' | 'other';
  balance: number;
  currency: string;
  color: string;
  description?: string;
  logo?: string | null;
  orderIndex?: number;        // for manual reordering
  createdAt?: any;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'debt' | 'lent' | 'transfer';
  title: string;
  amount: number;
  walletId: string;           // primary wallet (source for transfer, subject for others)
  fromWalletId?: string;      // transfer: source wallet
  toWalletId?: string;        // transfer: destination wallet
  category?: string;
  date: string;               // ISO date string (date only)
  createdAt?: any;            // full ISO timestamp — shown as time in UI
  notes?: string;
  personName?: string;
  phone?: string;
  profilePic?: string | null; // pfp for debt/lent transactions
  linkedRecordId?: string;    // "profile:<profileId>:<profileTxId>" or legacy lending/debts doc id
}

export interface PaymentHistoryEntry {
  amount: number;
  date: string;               // ISO timestamp (includes time)
  note?: string;
}

export interface LendingRecord {
  id: string;
  personName: string;
  phone?: string;
  amount: number;
  walletId: string;
  dueDate?: string;
  status: 'pending' | 'paid';
  notes?: string;
  profilePic?: string | null;
  paymentHistory?: PaymentHistoryEntry[];
  createdAt?: any;
}

export interface DebtRecord {
  id: string;
  lenderName: string;
  amount: number;
  walletId: string;
  dueDate?: string;
  status: 'pending' | 'paid';
  notes?: string;
  title?: string;
  profilePic?: string | null;
  paymentHistory?: PaymentHistoryEntry[];
  createdAt?: any;
}

export interface UserProfile {
  name: string;
  email: string;
  profilePic?: string | null;
  preferredCurrency?: string;
}

// SyncStatus includes 'failed' for SQLite sync-queue error state
export type SyncStatus   = 'synced' | 'syncing' | 'offline' | 'failed';
export type FilterPeriod = 'today' | 'week' | 'month' | 'year';
export type TxTypeFilter = 'all' | 'income' | 'expense' | 'debt' | 'lent' | 'transfer';
