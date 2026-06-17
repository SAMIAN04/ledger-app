// lib/profilesDatabase.ts — SQLite operations for Financial Profiles system
//
// Extends the existing offline-first architecture.
// All writes hit SQLite first, then queue for Firestore sync.

import { getDatabase, generateId, dbQueueAdd } from '@/lib/database';
import { FinancialProfile, ProfileTransaction } from '@/types/profiles';

// ─── Schema Init ──────────────────────────────────────────────────────────────

export async function initProfilesSchema(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS financial_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      type TEXT DEFAULT 'person',
      phone TEXT,
      email TEXT,
      notes TEXT,
      profile_pic TEXT,
      total_borrowed REAL DEFAULT 0,
      total_lent REAL DEFAULT 0,
      total_repaid REAL DEFAULT 0,
      total_received REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      interest_type TEXT DEFAULT 'none',
      interest_rate REAL,
      has_installment INTEGER DEFAULT 0,
      loan_amount REAL,
      installment_amount REAL,
      installment_due_day INTEGER,
      loan_term_months INTEGER,
      reminder_date TEXT,
      reminder_note TEXT,
      created_at TEXT,
      updated_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS profile_transactions (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL DEFAULT 0,
      wallet_id TEXT,
      wallet_name TEXT,
      note TEXT,
      date TEXT,
      attachment TEXT,
      created_at TEXT,
      updated_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    );
  `);

  // ── Additive column migrations ───────────────────────────────────────────────
  // Each ALTER TABLE is wrapped individually so existing installs upgrade safely
  // without dropping data. Fresh installs already have the column.
  const columnMigrations = [
    `ALTER TABLE profile_transactions ADD COLUMN updated_at TEXT`,
  ];
  for (const sql of columnMigrations) {
    try { await db.execAsync(sql); } catch { /* column already exists — OK */ }
  }
}

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

function rowToProfile(r: any): FinancialProfile {
  return {
    id: r.id,
    name: r.name || '',
    type: r.type || 'person',
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    profilePic: r.profile_pic,
    totalBorrowed: r.total_borrowed ?? 0,
    totalLent: r.total_lent ?? 0,
    totalRepaid: r.total_repaid ?? 0,
    totalReceived: r.total_received ?? 0,
    currentBalance: r.current_balance ?? 0,
    interestType: r.interest_type || 'none',
    interestRate: r.interest_rate,
    hasInstallment: !!r.has_installment,
    loanAmount: r.loan_amount,
    installmentAmount: r.installment_amount,
    installmentDueDay: r.installment_due_day,
    loanTermMonths: r.loan_term_months,
    reminderDate: r.reminder_date,
    reminderNote: r.reminder_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToProfileTx(r: any): ProfileTransaction {
  return {
    id: r.id,
    profileId: r.profile_id,
    type: r.type,
    amount: r.amount ?? 0,
    walletId: r.wallet_id,
    walletName: r.wallet_name,
    note: r.note,
    date: r.date,
    attachment: r.attachment,
    createdAt: r.created_at,
  };
}

export async function dbGetAllProfiles(): Promise<FinancialProfile[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM financial_profiles ORDER BY updated_at DESC');
  return rows.map(rowToProfile);
}

export async function dbGetProfile(id: string): Promise<FinancialProfile | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM financial_profiles WHERE id = ?', [id]);
  return row ? rowToProfile(row) : null;
}

export async function dbInsertProfile(profile: FinancialProfile, syncStatus = 'pending'): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO financial_profiles
     (id, name, type, phone, email, notes, profile_pic,
      total_borrowed, total_lent, total_repaid, total_received, current_balance,
      interest_type, interest_rate, has_installment, loan_amount,
      installment_amount, installment_due_day, loan_term_months,
      reminder_date, reminder_note, created_at, updated_at, sync_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      profile.id, profile.name, profile.type,
      profile.phone || null, profile.email || null, profile.notes || null, profile.profilePic || null,
      profile.totalBorrowed ?? 0, profile.totalLent ?? 0, profile.totalRepaid ?? 0,
      profile.totalReceived ?? 0, profile.currentBalance ?? 0,
      profile.interestType || 'none', profile.interestRate ?? null,
      profile.hasInstallment ? 1 : 0, profile.loanAmount ?? null,
      profile.installmentAmount ?? null, profile.installmentDueDay ?? null,
      profile.loanTermMonths ?? null,
      profile.reminderDate || null, profile.reminderNote || null,
      profile.createdAt || now, now, syncStatus,
    ]
  );
}

export async function dbUpdateProfile(id: string, data: Partial<FinancialProfile>): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: any[] = [];

  const map: Record<string, string> = {
    name: 'name', type: 'type', phone: 'phone', email: 'email', notes: 'notes',
    profilePic: 'profile_pic', totalBorrowed: 'total_borrowed', totalLent: 'total_lent',
    totalRepaid: 'total_repaid', totalReceived: 'total_received', currentBalance: 'current_balance',
    interestType: 'interest_type', interestRate: 'interest_rate',
    hasInstallment: 'has_installment', loanAmount: 'loan_amount',
    installmentAmount: 'installment_amount', installmentDueDay: 'installment_due_day',
    loanTermMonths: 'loan_term_months', reminderDate: 'reminder_date', reminderNote: 'reminder_note',
  };

  for (const [key, col] of Object.entries(map)) {
    if (key in data) {
      fields.push(`${col} = ?`);
      values.push(key === 'hasInstallment' ? (data[key as keyof FinancialProfile] ? 1 : 0) : (data as any)[key]);
    }
  }

  if (!fields.length) return;
  fields.push('updated_at = ?', 'sync_status = ?');
  values.push(now, 'pending', id);

  await db.runAsync(`UPDATE financial_profiles SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function dbDeleteProfile(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM financial_profiles WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM profile_transactions WHERE profile_id = ?', [id]);
}

// ─── Profile Transactions CRUD ────────────────────────────────────────────────

export async function dbGetProfileTransactions(profileId: string): Promise<ProfileTransaction[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM profile_transactions WHERE profile_id = ? ORDER BY created_at DESC',
    [profileId]
  );
  return rows.map(rowToProfileTx);
}

export async function dbInsertProfileTransaction(tx: ProfileTransaction, syncStatus = 'pending'): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO profile_transactions
     (id, profile_id, type, amount, wallet_id, wallet_name, note, date, attachment, created_at, updated_at, sync_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      tx.id, tx.profileId, tx.type, tx.amount,
      tx.walletId || null, tx.walletName || null,
      tx.note || null, tx.date, tx.attachment || null,
      tx.createdAt || now, now, syncStatus,
    ]
  );
}

export async function dbDeleteProfileTransaction(id: string, profileId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM profile_transactions WHERE id = ? AND profile_id = ?', [id, profileId]);
}

// ─── Balance Recalculation ────────────────────────────────────────────────────

export async function dbRecalculateProfileBalance(profileId: string): Promise<void> {
  const db = await getDatabase();

  // Join with wallets so we can convert each tx amount to BDT before summing.
  // Totals are stored in BDT; display code converts to preferredCurrency.
  const txs = await db.getAllAsync<any>(
    `SELECT pt.*, COALESCE(w.currency, 'BDT') as wallet_currency
     FROM profile_transactions pt
     LEFT JOIN wallets w ON w.id = pt.wallet_id
     WHERE pt.profile_id = ?`,
    [profileId]
  );

  // Import conversion rates inline to avoid circular deps
  const { RATES_TO_BDT } = await import('@/constants/data');
  function toBDT(amount: number, currency: string): number {
    return (amount ?? 0) * (RATES_TO_BDT[currency] || 1);
  }

  let totalBorrowed = 0, totalLent = 0, totalRepaid = 0, totalReceived = 0;

  for (const tx of txs) {
    const amt = toBDT(tx.amount ?? 0, tx.wallet_currency ?? 'BDT');
    switch (tx.type) {
      case 'borrow':     totalBorrowed  += amt; break;
      case 'lend':       totalLent      += amt; break;
      case 'repay':      totalRepaid    += amt; break;
      case 'receive':    totalReceived  += amt; break;
      case 'interest':   totalBorrowed  += amt; break;
      case 'fee':        totalBorrowed  += amt; break;
    }
  }

  const currentBalance = (totalBorrowed - totalRepaid) - (totalLent - totalReceived);
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE financial_profiles SET
     total_borrowed=?, total_lent=?, total_repaid=?, total_received=?,
     current_balance=?, updated_at=?, sync_status='pending'
     WHERE id=?`,
    [totalBorrowed, totalLent, totalRepaid, totalReceived, currentBalance, now, profileId]
  );
}

// ─── Hydration ────────────────────────────────────────────────────────────────

export async function hydrateProfiles(): Promise<FinancialProfile[]> {
  return dbGetAllProfiles();
}