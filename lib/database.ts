// lib/database.ts — SQLite primary source of truth (WhatsApp-style offline-first)
//
// Architecture:
//   React Native UI
//      ↓  reads from
//   Zustand (in-memory cache)
//      ↑  hydrated from
//   SQLite (primary source of truth)
//      ↕  async background sync
//   Firestore (cloud backup)
//
// Rules:
//   - All writes hit SQLite first, return immediately
//   - Writes are queued in sync_queue for Firestore
//   - UI reads only from Zustand (never waits for Firestore)
//   - Firestore data is merged into SQLite using newest-wins strategy

import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Wallet, Transaction, LendingRecord, DebtRecord } from '@/types';

// ─── Singleton ────────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('ledger.db');
  await _initSchema(_db);
  return _db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

async function _initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      type TEXT DEFAULT 'cash',
      balance REAL DEFAULT 0,
      currency TEXT DEFAULT 'BDT',
      color TEXT DEFAULT '#22c55e',
      description TEXT DEFAULT '',
      logo TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT,
      last_synced_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      wallet_id TEXT,
      from_wallet_id TEXT,
      to_wallet_id TEXT,
      category TEXT DEFAULT '',
      date TEXT,
      notes TEXT,
      person_name TEXT,
      phone TEXT,
      profile_pic TEXT,
      linked_record_id TEXT,
      created_at TEXT,
      updated_at TEXT,
      last_synced_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS lending (
      id TEXT PRIMARY KEY,
      person_name TEXT DEFAULT '',
      phone TEXT,
      amount REAL DEFAULT 0,
      wallet_id TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      profile_pic TEXT,
      payment_history TEXT DEFAULT '[]',
      created_at TEXT,
      updated_at TEXT,
      last_synced_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      lender_name TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      wallet_id TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      title TEXT,
      profile_pic TEXT,
      payment_history TEXT DEFAULT '[]',
      created_at TEXT,
      updated_at TEXT,
      last_synced_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deleted_entities (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tx_wallet    ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_tx_type      ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_tx_created   ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_lend_status  ON lending(status);
    CREATE INDEX IF NOT EXISTS idx_debt_status  ON debts(status);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON sync_queue(status);
    CREATE INDEX IF NOT EXISTS idx_queue_entity ON sync_queue(entity_id);
    CREATE INDEX IF NOT EXISTS idx_tombstone_deleted_at ON deleted_entities(deleted_at);
  `);

  // ── Additive column migrations ─────────────────────────────────────────────
  // Each ALTER TABLE is wrapped individually — SQLite throws "duplicate column"
  // on an existing column; we catch and ignore that so fresh installs and
  // upgrades both succeed.
  const columnMigrations = [
    `ALTER TABLE wallets ADD COLUMN order_index INTEGER DEFAULT 0`,
    `ALTER TABLE transactions ADD COLUMN from_wallet_id TEXT`,
    `ALTER TABLE transactions ADD COLUMN to_wallet_id TEXT`,
  ];
  for (const sql of columnMigrations) {
    try { await db.execAsync(sql); } catch { /* column already exists — OK */ }
  }

  // ── Index migrations (must run AFTER column migrations) ──────────────────
  // idx_wallet_order references order_index, which may have just been added
  // above. Putting it here — not in the main execAsync block — guarantees the
  // column exists before we try to index it, on both fresh installs and upgrades.
  const indexMigrations = [
    `CREATE INDEX IF NOT EXISTS idx_wallet_order ON wallets(order_index)`,
  ];
  for (const sql of indexMigrations) {
    try { await db.execAsync(sql); } catch { /* index already exists — OK */ }
  }

  // ── Tombstone housekeeping ──────────────────────────────────────────────
  // Safety-net prune, once per cold start. The normal path clears a
  // tombstone the moment its DELETE is confirmed synced (dbQueueMarkSynced);
  // this only catches ones that were ever orphaned (e.g. a delete that
  // permanently failed server-side).
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await db.runAsync('DELETE FROM deleted_entities WHERE deleted_at < ?', [cutoff]);
  } catch { /* table may not exist yet on a very first run — harmless */ }
}

// ─── UUID helper ──────────────────────────────────────────────────────────────

export function generateId(): string {
  try {
    return (crypto as any).randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

// ─── Type conversions ─────────────────────────────────────────────────────────

function rowToWallet(row: any): Wallet {
  return {
    id: row.id,
    name: row.name || '',
    type: row.type || 'cash',
    balance: row.balance ?? 0,
    currency: row.currency || 'BDT',
    color: row.color || '#22c55e',
    description: row.description || undefined,
    logo: row.logo || null,
    orderIndex: row.order_index ?? 0,
    createdAt: row.created_at,
  };
}

function rowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    type: row.type,
    title: row.title || '',
    amount: row.amount ?? 0,
    walletId: row.wallet_id,
    fromWalletId: row.from_wallet_id || undefined,
    toWalletId: row.to_wallet_id || undefined,
    category: row.category || undefined,
    date: row.date,
    notes: row.notes || undefined,
    personName: row.person_name || undefined,
    phone: row.phone || undefined,
    profilePic: row.profile_pic || null,
    linkedRecordId: row.linked_record_id || undefined,
    createdAt: row.created_at,
  };
}

function rowToLending(row: any): LendingRecord {
  let paymentHistory: any[] = [];
  try { paymentHistory = JSON.parse(row.payment_history || '[]'); } catch {}
  return {
    id: row.id,
    personName: row.person_name || '',
    phone: row.phone || undefined,
    amount: row.amount ?? 0,
    walletId: row.wallet_id,
    dueDate: row.due_date || undefined,
    status: row.status || 'pending',
    notes: row.notes || undefined,
    profilePic: row.profile_pic || null,
    paymentHistory,
    createdAt: row.created_at,
  };
}

function rowToDebt(row: any): DebtRecord {
  let paymentHistory: any[] = [];
  try { paymentHistory = JSON.parse(row.payment_history || '[]'); } catch {}
  return {
    id: row.id,
    lenderName: row.lender_name || '',
    amount: row.amount ?? 0,
    walletId: row.wallet_id,
    dueDate: row.due_date || undefined,
    status: row.status || 'pending',
    notes: row.notes || undefined,
    title: row.title || undefined,
    profilePic: row.profile_pic || null,
    paymentHistory,
    createdAt: row.created_at,
  };
}

// ─── Wallets ──────────────────────────────────────────────────────────────────
// Ordered by order_index ASC so every query returns wallets in user-defined
// order. The sortWallets() helper in utils/walletSort.ts is still available
// for in-memory re-sorts, but the DB already returns them sorted.

export async function dbGetAllWallets(): Promise<Wallet[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM wallets ORDER BY order_index ASC, created_at ASC',
  );
  return rows.map(rowToWallet);
}

export async function dbInsertWallet(wallet: Wallet, syncStatus = 'pending'): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO wallets
     (id, name, type, balance, currency, color, description, logo, order_index,
      created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      wallet.id,
      wallet.name || '',
      wallet.type || 'cash',
      wallet.balance ?? 0,
      wallet.currency || 'BDT',
      wallet.color || '#22c55e',
      wallet.description || '',
      wallet.logo || null,
      wallet.orderIndex ?? 0,
      wallet.createdAt || now,
      now,
      syncStatus,
    ],
  );
}

export async function dbUpdateWallet(id: string, data: Partial<Wallet>): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const parts: string[] = [];
  const vals: any[] = [];

  if (data.name !== undefined)        { parts.push('name = ?');        vals.push(data.name); }
  if (data.type !== undefined)        { parts.push('type = ?');        vals.push(data.type); }
  if (data.balance !== undefined)     { parts.push('balance = ?');     vals.push(data.balance); }
  if (data.currency !== undefined)    { parts.push('currency = ?');    vals.push(data.currency); }
  if (data.color !== undefined)       { parts.push('color = ?');       vals.push(data.color); }
  if (data.description !== undefined) { parts.push('description = ?'); vals.push(data.description); }
  if (data.logo !== undefined)        { parts.push('logo = ?');        vals.push(data.logo); }
  if (data.orderIndex !== undefined)  { parts.push('order_index = ?'); vals.push(data.orderIndex); }

  parts.push('updated_at = ?');   vals.push(now);
  parts.push('sync_status = ?');  vals.push('pending');
  vals.push(id);

  if (parts.length > 2) {
    await db.runAsync(`UPDATE wallets SET ${parts.join(', ')} WHERE id = ?`, vals);
  }
}

export async function dbDeleteWallet(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM wallets WHERE id = ?', [id]);
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function dbGetAllTransactions(): Promise<Transaction[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM transactions ORDER BY created_at DESC');
  return rows.map(rowToTransaction);
}

export async function dbInsertTransaction(tx: Transaction, syncStatus = 'pending'): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO transactions
     (id, type, title, amount, wallet_id, from_wallet_id, to_wallet_id,
      category, date, notes, person_name, phone,
      profile_pic, linked_record_id, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.id,
      tx.type,
      tx.title || '',
      tx.amount ?? 0,
      tx.walletId,
      tx.fromWalletId || null,
      tx.toWalletId || null,
      tx.category || '',
      tx.date || now.split('T')[0],
      tx.notes || null,
      tx.personName || null,
      tx.phone || null,
      tx.profilePic || null,
      tx.linkedRecordId || null,
      tx.createdAt || now,
      now,
      syncStatus,
    ],
  );
}

export async function dbUpdateTransaction(id: string, data: Partial<Transaction>): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const parts: string[] = [];
  const vals: any[] = [];

  if (data.type !== undefined)           { parts.push('type = ?');             vals.push(data.type); }
  if (data.title !== undefined)          { parts.push('title = ?');            vals.push(data.title); }
  if (data.amount !== undefined)         { parts.push('amount = ?');           vals.push(data.amount); }
  if (data.walletId !== undefined)       { parts.push('wallet_id = ?');        vals.push(data.walletId); }
  if (data.fromWalletId !== undefined)   { parts.push('from_wallet_id = ?');   vals.push(data.fromWalletId); }
  if (data.toWalletId !== undefined)     { parts.push('to_wallet_id = ?');     vals.push(data.toWalletId); }
  if (data.category !== undefined)       { parts.push('category = ?');         vals.push(data.category); }
  if (data.date !== undefined)           { parts.push('date = ?');             vals.push(data.date); }
  if (data.notes !== undefined)          { parts.push('notes = ?');            vals.push(data.notes); }
  if (data.personName !== undefined)     { parts.push('person_name = ?');      vals.push(data.personName); }
  if (data.linkedRecordId !== undefined) { parts.push('linked_record_id = ?'); vals.push(data.linkedRecordId); }

  parts.push('updated_at = ?');  vals.push(now);
  parts.push('sync_status = ?'); vals.push('pending');
  vals.push(id);

  if (parts.length > 2) {
    await db.runAsync(`UPDATE transactions SET ${parts.join(', ')} WHERE id = ?`, vals);
  }
}

export async function dbDeleteTransaction(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

// ─── Lending ──────────────────────────────────────────────────────────────────

export async function dbGetAllLending(): Promise<LendingRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM lending ORDER BY created_at DESC');
  return rows.map(rowToLending);
}

export async function dbInsertLending(record: LendingRecord, syncStatus = 'pending'): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO lending
     (id, person_name, phone, amount, wallet_id, due_date, status, notes, profile_pic,
      payment_history, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.personName || '',
      record.phone || null,
      record.amount ?? 0,
      record.walletId,
      record.dueDate || null,
      record.status || 'pending',
      record.notes || null,
      record.profilePic || null,
      JSON.stringify(record.paymentHistory || []),
      record.createdAt || now,
      now,
      syncStatus,
    ],
  );
}

export async function dbUpdateLending(id: string, data: Partial<LendingRecord>): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const parts: string[] = [];
  const vals: any[] = [];

  if (data.personName !== undefined)     { parts.push('person_name = ?');     vals.push(data.personName); }
  if (data.amount !== undefined)         { parts.push('amount = ?');           vals.push(data.amount); }
  if (data.status !== undefined)         { parts.push('status = ?');           vals.push(data.status); }
  if (data.notes !== undefined)          { parts.push('notes = ?');            vals.push(data.notes); }
  if (data.dueDate !== undefined)        { parts.push('due_date = ?');         vals.push(data.dueDate); }
  if (data.paymentHistory !== undefined) { parts.push('payment_history = ?');  vals.push(JSON.stringify(data.paymentHistory)); }

  parts.push('updated_at = ?');  vals.push(now);
  parts.push('sync_status = ?'); vals.push('pending');
  vals.push(id);

  if (parts.length > 2) {
    await db.runAsync(`UPDATE lending SET ${parts.join(', ')} WHERE id = ?`, vals);
  }
}

export async function dbDeleteLending(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM lending WHERE id = ?', [id]);
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export async function dbGetAllDebts(): Promise<DebtRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM debts ORDER BY created_at DESC');
  return rows.map(rowToDebt);
}

export async function dbInsertDebt(record: DebtRecord, syncStatus = 'pending'): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO debts
     (id, lender_name, amount, wallet_id, due_date, status, notes, title, profile_pic,
      payment_history, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.lenderName || '',
      record.amount ?? 0,
      record.walletId,
      record.dueDate || null,
      record.status || 'pending',
      record.notes || null,
      record.title || null,
      record.profilePic || null,
      JSON.stringify(record.paymentHistory || []),
      record.createdAt || now,
      now,
      syncStatus,
    ],
  );
}

export async function dbUpdateDebt(id: string, data: Partial<DebtRecord>): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const parts: string[] = [];
  const vals: any[] = [];

  if (data.lenderName !== undefined)     { parts.push('lender_name = ?');    vals.push(data.lenderName); }
  if (data.amount !== undefined)         { parts.push('amount = ?');          vals.push(data.amount); }
  if (data.status !== undefined)         { parts.push('status = ?');          vals.push(data.status); }
  if (data.notes !== undefined)          { parts.push('notes = ?');           vals.push(data.notes); }
  if (data.title !== undefined)          { parts.push('title = ?');           vals.push(data.title); }
  if (data.dueDate !== undefined)        { parts.push('due_date = ?');        vals.push(data.dueDate); }
  if (data.paymentHistory !== undefined) { parts.push('payment_history = ?'); vals.push(JSON.stringify(data.paymentHistory)); }

  parts.push('updated_at = ?');  vals.push(now);
  parts.push('sync_status = ?'); vals.push('pending');
  vals.push(id);

  if (parts.length > 2) {
    await db.runAsync(`UPDATE debts SET ${parts.join(', ')} WHERE id = ?`, vals);
  }
}

export async function dbDeleteDebt(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM debts WHERE id = ?', [id]);
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────

export interface SyncQueueItem {
  id: string;
  entityType: 'wallets' | 'transactions' | 'lending' | 'debts' | 'financial_profiles' | 'profile_transactions';
  entityId: string;
  operationType: 'ADD' | 'UPDATE' | 'DELETE';
  payload: Record<string, any>;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function dbQueueAdd(
  item: Pick<SyncQueueItem, 'entityType' | 'entityId' | 'operationType' | 'payload'>,
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = `sq_${now}_${Math.random().toString(36).slice(2)}`;

  // Tombstone immediately: from this moment until the DELETE is confirmed
  // synced, dbBatchUpsertFromServer must refuse to resurrect this id.
  if (item.operationType === 'DELETE') {
    await dbTombstoneAdd(item.entityType, item.entityId);
  }

  // Deduplicate: if there's already a pending item for this entity+type+operation, update it
  const existing = await db.getFirstAsync<any>(
    "SELECT id FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND operation_type = ? AND status = 'pending'",
    [item.entityType, item.entityId, item.operationType],
  );

  if (existing) {
    await db.runAsync(
      'UPDATE sync_queue SET payload = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(item.payload), now, existing.id],
    );
  } else {
    await db.runAsync(
      `INSERT INTO sync_queue (id, entity_type, entity_id, operation_type, payload, status, retry_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      [id, item.entityType, item.entityId, item.operationType, JSON.stringify(item.payload), now, now],
    );
  }
}

export async function dbQueueGetPending(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM sync_queue
     WHERE status = 'pending' OR (status = 'failed' AND retry_count < 5)
     ORDER BY created_at ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type as SyncQueueItem['entityType'],
    entityId: r.entity_id,
    operationType: r.operation_type as SyncQueueItem['operationType'],
    payload: (() => { try { return JSON.parse(r.payload || '{}'); } catch { return {}; } })(),
    status: r.status as SyncQueueItem['status'],
    retryCount: r.retry_count || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function dbQueueMarkSynced(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  // If this was a DELETE, the deletion is now confirmed server-side too —
  // safe to release the tombstone.
  const row = await db.getFirstAsync<{ entity_type: string; entity_id: string; operation_type: string }>(
    'SELECT entity_type, entity_id, operation_type FROM sync_queue WHERE id = ?',
    [id],
  );
  if (row?.operation_type === 'DELETE') {
    await dbTombstoneRemove(row.entity_type, row.entity_id);
  }

  await db.runAsync(
    "UPDATE sync_queue SET status = 'synced', updated_at = ? WHERE id = ?",
    [now, id],
  );
  // Purge old synced items to keep the table lean
  await db.runAsync("DELETE FROM sync_queue WHERE status = 'synced'");
}

export async function dbQueueMarkFailed(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, updated_at = ? WHERE id = ?",
    [now, id],
  );
}

export async function dbQueuePendingCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending' OR (status = 'failed' AND retry_count < 5)",
  );
  return result?.count ?? 0;
}

// Strict variant for the sign-out safety gate: counts EVERY row that isn't
// confirmed 'synced', including ones that exhausted their retries. Unlike
// dbQueuePendingCount (which intentionally stops counting an item after 5
// failed attempts so the background loop doesn't hammer a broken write
// forever), giving up after 5 tries is exactly the data-loss scenario this
// gate exists to catch — it must never be silently read as "safe to wipe."
export async function dbQueueUnsyncedCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status != 'synced'",
  );
  return result?.count ?? 0;
}

// ─── Deletion Tombstones ────────────────────────────────────────────────────
//
// Problem this solves: dbBatchUpsertFromServer merges whatever the live
// Firestore listener hands it into SQLite. If the user deletes something
// locally, the delete is queued for upload but hasn't necessarily reached the
// Firestore SERVER yet (that takes a real network round-trip). If a snapshot
// fires in that window — and listeners fire often, for all sorts of reasons
// unrelated to this specific change — it can still contain the old doc, and
// the merge logic has no way to tell "this is a brand-new id from the server"
// apart from "this id was deleted a second ago and just hasn't synced yet."
// Both look identical: the row is simply absent from local SQLite. Result:
// the deleted item silently reappears.
//
// A tombstone closes that gap. It's written the instant a DELETE is queued
// (dbQueueAdd) and removed once that DELETE is confirmed synced
// (dbQueueMarkSynced) — at which point the server doesn't have the doc
// either, so there's nothing left to resurrect from. The 48h expiry is purely
// a safety net in case a tombstone is ever orphaned (e.g. the delete
// permanently fails server-side) so this table never grows unbounded.

const TOMBSTONE_EXPIRY_MS = 48 * 60 * 60 * 1000;

export async function dbTombstoneAdd(entityType: string, entityId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT OR REPLACE INTO deleted_entities (entity_type, entity_id, deleted_at) VALUES (?, ?, ?)',
    [entityType, entityId, now],
  );
}

export async function dbTombstoneRemove(entityType: string, entityId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM deleted_entities WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId],
  );
}

export async function dbTombstoneIsActive(entityType: string, entityId: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ deleted_at: string }>(
    'SELECT deleted_at FROM deleted_entities WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId],
  );
  if (!row) return false;
  return Date.now() - new Date(row.deleted_at).getTime() < TOMBSTONE_EXPIRY_MS;
}

export async function dbTombstonePruneExpired(): Promise<void> {
  const db = await getDatabase();
  const cutoff = new Date(Date.now() - TOMBSTONE_EXPIRY_MS).toISOString();
  await db.runAsync('DELETE FROM deleted_entities WHERE deleted_at < ?', [cutoff]);
}

// ─── Clear all user data (call on sign-out / account switch) ─────────────────

export async function clearAllUserData(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM wallets;
    DELETE FROM transactions;
    DELETE FROM lending;
    DELETE FROM debts;
    DELETE FROM sync_queue;
  `);
  try {
    await db.execAsync(`
      DELETE FROM financial_profiles;
      DELETE FROM profile_transactions;
    `);
  } catch {
    // Tables not yet created on a fresh install — safe to ignore
  }
}

// ─── Metadata helpers ─────────────────────────────────────────────────────────

export async function dbMetaGet(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>('SELECT value FROM sync_metadata WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function dbMetaSet(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)',
    [key, value, now],
  );
}

// ─── Hydration ────────────────────────────────────────────────────────────────

export interface HydratedData {
  wallets: Wallet[];
  transactions: Transaction[];
  lending: LendingRecord[];
  debts: DebtRecord[];
  profiles?: any[];
  profileTransactions?: any[];
}

export async function hydrateFromSQLite(): Promise<HydratedData> {
  const [wallets, transactions, lending, debts] = await Promise.all([
    dbGetAllWallets(),
    dbGetAllTransactions(),
    dbGetAllLending(),
    dbGetAllDebts(),
  ]);
  return { wallets, transactions, lending, debts };
}

// ─── Firestore batch upsert (newest-wins conflict resolution) ─────────────────

export async function dbBatchUpsertFromServer(
  entityType: 'wallets' | 'transactions' | 'lending' | 'debts' | 'financial_profiles' | 'profile_transactions',
  serverDocs: any[],
): Promise<boolean> {
  if (!serverDocs.length) return false;
  const db = await getDatabase();
  let didUpdate = false;
  const now = new Date().toISOString();

  for (const sdoc of serverDocs) {
    if (!sdoc?.id) continue;

    // Refuse to resurrect anything deleted locally that hasn't been
    // confirmed-deleted on the server yet (stale/delayed snapshot guard —
    // see "Deletion Tombstones" above dbTombstoneAdd).
    if (await dbTombstoneIsActive(entityType, sdoc.id)) continue;

    const serverUpdatedAt: string = sdoc.updatedAt || sdoc.createdAt || '';

    const local = await db.getFirstAsync<{ sync_status: string; updated_at: string }>(
      `SELECT sync_status, updated_at FROM ${entityType} WHERE id = ?`,
      [sdoc.id],
    );

    if (local?.sync_status === 'pending') continue;
    if (local?.updated_at && serverUpdatedAt && serverUpdatedAt <= local.updated_at) continue;

    if (entityType === 'wallets') {
      await dbInsertWallet({
        id: sdoc.id, name: sdoc.name || '', type: sdoc.type || 'cash',
        balance: sdoc.balance ?? 0, currency: sdoc.currency || 'BDT',
        color: sdoc.color || '#22c55e', description: sdoc.description,
        logo: sdoc.logo || null, orderIndex: sdoc.orderIndex ?? 0,
        createdAt: sdoc.createdAt,
      }, 'synced');
      await db.runAsync(
        'UPDATE wallets SET updated_at = ?, last_synced_at = ?, sync_status = ? WHERE id = ?',
        [serverUpdatedAt || now, now, 'synced', sdoc.id],
      );
    } else if (entityType === 'transactions') {
      await dbInsertTransaction({
        id: sdoc.id, type: sdoc.type, title: sdoc.title || '',
        amount: sdoc.amount ?? 0, walletId: sdoc.walletId,
        fromWalletId: sdoc.fromWalletId, toWalletId: sdoc.toWalletId,
        category: sdoc.category, date: sdoc.date, notes: sdoc.notes,
        personName: sdoc.personName, phone: sdoc.phone,
        profilePic: sdoc.profilePic, linkedRecordId: sdoc.linkedRecordId,
        createdAt: sdoc.createdAt,
      }, 'synced');
      await db.runAsync(
        'UPDATE transactions SET updated_at = ?, last_synced_at = ?, sync_status = ? WHERE id = ?',
        [serverUpdatedAt || now, now, 'synced', sdoc.id],
      );
    } else if (entityType === 'lending') {
      await dbInsertLending({
        id: sdoc.id, personName: sdoc.personName || '', phone: sdoc.phone,
        amount: sdoc.amount ?? 0, walletId: sdoc.walletId, dueDate: sdoc.dueDate,
        status: sdoc.status || 'pending', notes: sdoc.notes, profilePic: sdoc.profilePic,
        paymentHistory: sdoc.paymentHistory || [], createdAt: sdoc.createdAt,
      }, 'synced');
      await db.runAsync(
        'UPDATE lending SET updated_at = ?, last_synced_at = ?, sync_status = ? WHERE id = ?',
        [serverUpdatedAt || now, now, 'synced', sdoc.id],
      );
    } else if (entityType === 'debts') {
      await dbInsertDebt({
        id: sdoc.id, lenderName: sdoc.lenderName || '',
        amount: sdoc.amount ?? 0, walletId: sdoc.walletId, dueDate: sdoc.dueDate,
        status: sdoc.status || 'pending', notes: sdoc.notes, title: sdoc.title,
        profilePic: sdoc.profilePic, paymentHistory: sdoc.paymentHistory || [],
        createdAt: sdoc.createdAt,
      }, 'synced');
      await db.runAsync(
        'UPDATE debts SET updated_at = ?, last_synced_at = ?, sync_status = ? WHERE id = ?',
        [serverUpdatedAt || now, now, 'synced', sdoc.id],
      );
    } else if (entityType === 'financial_profiles') {
      const tableCheck = await db.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='financial_profiles'"
      );
      if (!tableCheck) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO financial_profiles
         (id, name, type, phone, email, notes, profile_pic,
          total_borrowed, total_lent, total_repaid, total_received, current_balance,
          interest_type, interest_rate, has_installment, loan_amount,
          installment_amount, installment_due_day, loan_term_months,
          reminder_date, reminder_note, created_at, updated_at, sync_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          sdoc.id, sdoc.name || '', sdoc.type || 'person',
          sdoc.phone || null, sdoc.email || null, sdoc.notes || null, sdoc.profilePic || null,
          sdoc.totalBorrowed ?? 0, sdoc.totalLent ?? 0, sdoc.totalRepaid ?? 0,
          sdoc.totalReceived ?? 0, sdoc.currentBalance ?? 0,
          sdoc.interestType || 'none', sdoc.interestRate ?? null,
          sdoc.hasInstallment ? 1 : 0, sdoc.loanAmount ?? null,
          sdoc.installmentAmount ?? null, sdoc.installmentDueDay ?? null,
          sdoc.loanTermMonths ?? null,
          sdoc.reminderDate || null, sdoc.reminderNote || null,
          sdoc.createdAt || now, serverUpdatedAt || now, 'synced',
        ]
      );
    } else if (entityType === 'profile_transactions') {
      const tableCheck = await db.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='profile_transactions'"
      );
      if (!tableCheck) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO profile_transactions
         (id, profile_id, type, amount, wallet_id, wallet_name, note, date, attachment, created_at, updated_at, sync_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          sdoc.id, sdoc.profileId, sdoc.type, sdoc.amount ?? 0,
          sdoc.walletId || null, sdoc.walletName || null,
          sdoc.note || null, sdoc.date, sdoc.attachment || null,
          sdoc.createdAt || now, serverUpdatedAt || now, 'synced',
        ]
      );
    }
    didUpdate = true;
  }

  return didUpdate;
}

// ─── AsyncStorage → SQLite migration (runs once on first launch) ──────────────

export async function migrateFromAsyncStorage(): Promise<void> {
  const migrationKey = 'migration_v1_done';
  const done = await dbMetaGet(migrationKey);
  if (done === 'true') return;

  try {
    const pairs = await AsyncStorage.multiGet(['wallets', 'transactions', 'lending', 'debts']);
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      const items: any[] = JSON.parse(raw);
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (!item?.id) continue;
        if (key === 'wallets')           await dbInsertWallet(item, 'synced').catch(() => {});
        else if (key === 'transactions') await dbInsertTransaction(item, 'synced').catch(() => {});
        else if (key === 'lending')      await dbInsertLending(item, 'synced').catch(() => {});
        else if (key === 'debts')        await dbInsertDebt(item, 'synced').catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[db] migration error:', e);
  }

  await dbMetaSet(migrationKey, 'true');
}
