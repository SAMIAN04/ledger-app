// types/profiles.ts — Financial Profile System Types

export type ProfileType =
  | 'friend'
  | 'family'
  | 'person'
  | 'bank'
  | 'company'
  | 'business'
  | 'other';

export type ProfileTransactionType =
  | 'borrow'      // User receives money → wallet up, user owes
  | 'lend'        // User gives money → wallet down, profile owes
  | 'repay'       // User pays back → wallet down, debt reduced
  | 'receive'     // Profile pays user → wallet up, credit reduced
  | 'adjustment'  // Manual correction, no wallet effect
  | 'interest'    // Interest charge, no wallet effect
  | 'fee';        // Fee, no wallet effect

export type ProfileStatus = 'you_owe' | 'owes_you' | 'settled';

export type InterestType = 'none' | 'simple' | 'compound' | 'custom';

export interface FinancialProfile {
  id: string;
  name: string;
  type: ProfileType;
  phone?: string;
  email?: string;
  notes?: string;
  profilePic?: string | null;

  // Computed balances (stored for performance)
  totalBorrowed: number;    // How much user borrowed from this profile
  totalLent: number;        // How much user lent to this profile
  totalRepaid: number;      // How much user repaid to this profile
  totalReceived: number;    // How much this profile paid user back
  currentBalance: number;   // (totalBorrowed - totalRepaid) - (totalLent - totalReceived)
  // Positive = user owes | Negative = profile owes | Zero = settled

  // Interest settings
  interestType: InterestType;
  interestRate?: number;    // annual rate %

  // Installment (for banks/loans)
  hasInstallment?: boolean;
  loanAmount?: number;
  installmentAmount?: number;
  installmentDueDay?: number; // day of month
  loanTermMonths?: number;

  // Reminder
  reminderDate?: string;
  reminderNote?: string;

  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileTransaction {
  id: string;
  profileId: string;
  type: ProfileTransactionType;
  amount: number;
  walletId?: string;        // Which wallet was used (null for adjustment/interest/fee)
  walletName?: string;      // Snapshot of wallet name at time of tx
  note?: string;
  date: string;             // ISO date string
  createdAt?: string;

  // Attachment (optional)
  attachment?: string | null; // base64 or URL
}

export type ProfileFilterType = 'all' | 'you_owe' | 'owes_you' | 'settled' | 'bank' | 'business' | 'person';
