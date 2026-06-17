// hooks/useFirestore.ts — Offline-first CRUD + Transfer + Wallet Reorder
//
// Write flow for every operation:
//   1. Generate UUID locally (crypto.randomUUID)
//   2. Write to SQLite immediately            → persists even if app crashes
//   3. Update Zustand immediately             → UI renders new state instantly
//   4. Enqueue in sync_queue                  → Firestore upload when online
//   5. Return to caller (no Firestore await)  → feels instant to the user

import NetInfo from '@react-native-community/netinfo';
import { useAppStore } from '@/store/useAppStore';
import {
  dbInsertWallet, dbUpdateWallet, dbDeleteWallet, dbGetAllWallets,
  dbInsertTransaction, dbUpdateTransaction, dbDeleteTransaction, dbGetAllTransactions,
  dbInsertLending, dbUpdateLending, dbDeleteLending, dbGetAllLending,
  dbInsertDebt, dbUpdateDebt, dbDeleteDebt, dbGetAllDebts,
  dbQueueAdd, generateId,
} from '@/lib/database';
import { Wallet, Transaction, LendingRecord, DebtRecord } from '@/types';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFirestore() {
  const {
    setSyncStatus,
    setWallets, setTransactions, setLending, setDebts,
    wallets, transactions, lending, debts,
  } = useAppStore();

  async function isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return !!(state.isConnected && state.isInternetReachable);
  }

  async function refreshAndNotify() {
    const online = await isOnline();
    setSyncStatus(online ? 'syncing' : 'offline', online ? 'Syncing…' : 'Offline');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GENERIC CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async function fbAdd(
    col: 'wallets' | 'transactions' | 'lending' | 'debts',
    data: any,
  ): Promise<string> {
    const id = generateId();
    const now = new Date().toISOString();
    const entry = { id, ...data, createdAt: now };

    if (col === 'wallets') {
      await dbInsertWallet(entry as Wallet, 'pending');
      const updated = await dbGetAllWallets();
      setWallets(updated);
      await dbQueueAdd({ entityType: 'wallets', entityId: id, operationType: 'ADD', payload: data });

    } else if (col === 'transactions') {
      await dbInsertTransaction(entry as Transaction, 'pending');
      const updated = await dbGetAllTransactions();
      setTransactions(updated);
      await dbQueueAdd({ entityType: 'transactions', entityId: id, operationType: 'ADD', payload: data });

    } else if (col === 'lending') {
      await dbInsertLending(entry as LendingRecord, 'pending');
      const updated = await dbGetAllLending();
      setLending(updated);
      await dbQueueAdd({ entityType: 'lending', entityId: id, operationType: 'ADD', payload: data });

    } else if (col === 'debts') {
      await dbInsertDebt(entry as DebtRecord, 'pending');
      const updated = await dbGetAllDebts();
      setDebts(updated);
      await dbQueueAdd({ entityType: 'debts', entityId: id, operationType: 'ADD', payload: data });
    }

    await refreshAndNotify();
    return id;
  }

  async function fbUpdate(
    col: 'wallets' | 'transactions' | 'lending' | 'debts',
    id: string,
    data: any,
  ): Promise<void> {
    if (col === 'wallets') {
      await dbUpdateWallet(id, data as Partial<Wallet>);
      const updated = await dbGetAllWallets();
      setWallets(updated);
      await dbQueueAdd({ entityType: 'wallets', entityId: id, operationType: 'UPDATE', payload: data });

    } else if (col === 'transactions') {
      await dbUpdateTransaction(id, data as Partial<Transaction>);
      const updated = await dbGetAllTransactions();
      setTransactions(updated);
      await dbQueueAdd({ entityType: 'transactions', entityId: id, operationType: 'UPDATE', payload: data });

    } else if (col === 'lending') {
      await dbUpdateLending(id, data as Partial<LendingRecord>);
      const updated = await dbGetAllLending();
      setLending(updated);
      await dbQueueAdd({ entityType: 'lending', entityId: id, operationType: 'UPDATE', payload: data });

    } else if (col === 'debts') {
      await dbUpdateDebt(id, data as Partial<DebtRecord>);
      const updated = await dbGetAllDebts();
      setDebts(updated);
      await dbQueueAdd({ entityType: 'debts', entityId: id, operationType: 'UPDATE', payload: data });
    }

    await refreshAndNotify();
  }

  async function fbDelete(
    col: 'wallets' | 'transactions' | 'lending' | 'debts',
    id: string,
  ): Promise<void> {
    if (col === 'wallets') {
      await dbDeleteWallet(id);
      const updated = await dbGetAllWallets();
      setWallets(updated);
      await dbQueueAdd({ entityType: 'wallets', entityId: id, operationType: 'DELETE', payload: {} });

    } else if (col === 'transactions') {
      await dbDeleteTransaction(id);
      const updated = await dbGetAllTransactions();
      setTransactions(updated);
      await dbQueueAdd({ entityType: 'transactions', entityId: id, operationType: 'DELETE', payload: {} });

    } else if (col === 'lending') {
      await dbDeleteLending(id);
      const updated = await dbGetAllLending();
      setLending(updated);
      await dbQueueAdd({ entityType: 'lending', entityId: id, operationType: 'DELETE', payload: {} });

    } else if (col === 'debts') {
      await dbDeleteDebt(id);
      const updated = await dbGetAllDebts();
      setDebts(updated);
      await dbQueueAdd({ entityType: 'debts', entityId: id, operationType: 'DELETE', payload: {} });
    }

    await refreshAndNotify();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSFER
  //
  // Creates a single transaction record of type 'transfer'.
  // Atomically:
  //   • Decreases source wallet balance
  //   • Increases destination wallet balance
  //   • Writes a transfer transaction record
  //
  // The single transaction record uses walletId = fromWalletId (source) for
  // display purposes in the source wallet's history, plus fromWalletId and
  // toWalletId for bidirectional lookup.
  // ─────────────────────────────────────────────────────────────────────────

  async function fbTransfer(params: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    date: string;
    notes?: string;
  }): Promise<string> {
    const { fromWalletId, toWalletId, amount, date, notes } = params;
    const now = new Date().toISOString();
    const id = generateId();

    const fromWallet = wallets.find(w => w.id === fromWalletId);
    const toWallet   = wallets.find(w => w.id === toWalletId);
    if (!fromWallet || !toWallet) throw new Error('Wallet not found');

    // ── 1. Update source wallet balance (decrease) ────────────────────────
    const newFromBalance = (fromWallet.balance || 0) - amount;
    await dbUpdateWallet(fromWalletId, { balance: newFromBalance });
    await dbQueueAdd({ entityType: 'wallets', entityId: fromWalletId, operationType: 'UPDATE', payload: { balance: newFromBalance } });

    // ── 2. Update destination wallet balance (increase) ───────────────────
    const newToBalance = (toWallet.balance || 0) + amount;
    await dbUpdateWallet(toWalletId, { balance: newToBalance });
    await dbQueueAdd({ entityType: 'wallets', entityId: toWalletId, operationType: 'UPDATE', payload: { balance: newToBalance } });

    // ── 3. Write transfer transaction record ──────────────────────────────
    const txPayload: Transaction = {
      id,
      type: 'transfer',
      title: `${fromWallet.name} → ${toWallet.name}`,
      amount,
      walletId: fromWalletId,    // primary wallet = source
      fromWalletId,
      toWalletId,
      date,
      notes: notes || undefined,
      createdAt: now,
    };
    await dbInsertTransaction(txPayload, 'pending');
    await dbQueueAdd({
      entityType: 'transactions', entityId: id, operationType: 'ADD',
      payload: { type: 'transfer', amount, walletId: fromWalletId, fromWalletId, toWalletId, date, notes, title: txPayload.title },
    });

    // ── 4. Sync Zustand ───────────────────────────────────────────────────
    const [updatedWallets, updatedTxs] = await Promise.all([
      dbGetAllWallets(),
      dbGetAllTransactions(),
    ]);
    setWallets(updatedWallets);
    setTransactions(updatedTxs);

    await refreshAndNotify();
    return id;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE TRANSFER
  //
  // Reverses the balance changes made by a transfer.
  // Source wallet gets +amount, destination wallet gets -amount.
  // ─────────────────────────────────────────────────────────────────────────

  async function fbDeleteTransfer(txId: string): Promise<void> {
    const tx = transactions.find(t => t.id === txId);
    if (!tx || tx.type !== 'transfer') return;

    const fromWallet = wallets.find(w => w.id === tx.fromWalletId);
    const toWallet   = wallets.find(w => w.id === tx.toWalletId);

    // Reverse source wallet (add back the amount)
    if (fromWallet) {
      const restored = (fromWallet.balance || 0) + tx.amount;
      await dbUpdateWallet(fromWallet.id, { balance: restored });
      await dbQueueAdd({ entityType: 'wallets', entityId: fromWallet.id, operationType: 'UPDATE', payload: { balance: restored } });
    }

    // Reverse destination wallet (subtract the amount)
    if (toWallet) {
      const restored = (toWallet.balance || 0) - tx.amount;
      await dbUpdateWallet(toWallet.id, { balance: restored });
      await dbQueueAdd({ entityType: 'wallets', entityId: toWallet.id, operationType: 'UPDATE', payload: { balance: restored } });
    }

    // Delete the transaction record
    await dbDeleteTransaction(txId);
    await dbQueueAdd({ entityType: 'transactions', entityId: txId, operationType: 'DELETE', payload: {} });

    const [updatedWallets, updatedTxs] = await Promise.all([
      dbGetAllWallets(),
      dbGetAllTransactions(),
    ]);
    setWallets(updatedWallets);
    setTransactions(updatedTxs);

    await refreshAndNotify();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EDIT TRANSFER
  //
  // Reverse original transfer, apply new one atomically.
  // ─────────────────────────────────────────────────────────────────────────

  async function fbEditTransfer(params: {
    txId: string;
    fromWalletId: string;
    toWalletId: string;
    newAmount: number;
    date: string;
    notes?: string;
  }): Promise<void> {
    const { txId, fromWalletId, toWalletId, newAmount, date, notes } = params;

    const oldTx = transactions.find(t => t.id === txId);
    if (!oldTx || oldTx.type !== 'transfer') return;

    // ── Reverse original transfer balances ────────────────────────────────
    const oldFrom = wallets.find(w => w.id === oldTx.fromWalletId);
    const oldTo   = wallets.find(w => w.id === oldTx.toWalletId);
    if (oldFrom) {
      const restored = (oldFrom.balance || 0) + oldTx.amount;
      await dbUpdateWallet(oldFrom.id, { balance: restored });
      await dbQueueAdd({ entityType: 'wallets', entityId: oldFrom.id, operationType: 'UPDATE', payload: { balance: restored } });
    }
    if (oldTo) {
      const restored = (oldTo.balance || 0) - oldTx.amount;
      await dbUpdateWallet(oldTo.id, { balance: restored });
      await dbQueueAdd({ entityType: 'wallets', entityId: oldTo.id, operationType: 'UPDATE', payload: { balance: restored } });
    }

    // ── Apply new transfer balances ───────────────────────────────────────
    // Re-read wallets from DB so we have the restored balances
    const freshWallets = await dbGetAllWallets();
    const newFrom = freshWallets.find(w => w.id === fromWalletId);
    const newTo   = freshWallets.find(w => w.id === toWalletId);

    if (newFrom) {
      const updated = (newFrom.balance || 0) - newAmount;
      await dbUpdateWallet(newFrom.id, { balance: updated });
      await dbQueueAdd({ entityType: 'wallets', entityId: newFrom.id, operationType: 'UPDATE', payload: { balance: updated } });
    }
    if (newTo) {
      const updated = (newTo.balance || 0) + newAmount;
      await dbUpdateWallet(newTo.id, { balance: updated });
      await dbQueueAdd({ entityType: 'wallets', entityId: newTo.id, operationType: 'UPDATE', payload: { balance: updated } });
    }

    // ── Update transaction record ─────────────────────────────────────────
    const newFromWallet = freshWallets.find(w => w.id === fromWalletId);
    const newToWallet   = freshWallets.find(w => w.id === toWalletId);
    const title = `${newFromWallet?.name || fromWalletId} → ${newToWallet?.name || toWalletId}`;

    await dbUpdateTransaction(txId, {
      title, amount: newAmount, walletId: fromWalletId,
      fromWalletId, toWalletId, date, notes: notes || undefined,
    });
    await dbQueueAdd({
      entityType: 'transactions', entityId: txId, operationType: 'UPDATE',
      payload: { title, amount: newAmount, walletId: fromWalletId, fromWalletId, toWalletId, date, notes },
    });

    const [updatedWallets, updatedTxs] = await Promise.all([
      dbGetAllWallets(),
      dbGetAllTransactions(),
    ]);
    setWallets(updatedWallets);
    setTransactions(updatedTxs);

    await refreshAndNotify();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WALLET REORDERING
  //
  // Accepts the full new ordered array of wallet ids and writes each wallet's
  // new orderIndex atomically to SQLite, queues Firestore syncs, and pushes
  // the refreshed list to Zustand so every screen updates instantly.
  // ─────────────────────────────────────────────────────────────────────────

  async function fbReorderWallets(orderedIds: string[]): Promise<void> {
    await Promise.all(
      orderedIds.map(async (id, index) => {
        await dbUpdateWallet(id, { orderIndex: index });
        await dbQueueAdd({
          entityType: 'wallets', entityId: id, operationType: 'UPDATE',
          payload: { orderIndex: index },
        });
      }),
    );

    const updated = await dbGetAllWallets();
    setWallets(updated);
    await refreshAndNotify();
  }

  return { fbAdd, fbUpdate, fbDelete, fbTransfer, fbDeleteTransfer, fbEditTransfer, fbReorderWallets };
}
