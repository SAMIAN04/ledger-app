import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { convertToPreferred } from '@/lib/currency';
import { Transaction } from '@/types';
import { sortWallets } from '@/utils/walletSort';
import { CATEGORY_COLORS } from '@/constants/data';

export function useFilteredTransactions() {
  const { transactions, filterPeriod } = useAppStore();
  return useMemo(() => {
    const now = new Date();
    return transactions.filter((tx) => {
      // Transfers appear in the list but are excluded from period summaries
      if (!tx.date) return false;
      const d = new Date(tx.date);
      if (filterPeriod === 'today') return d.toDateString() === now.toDateString();
      if (filterPeriod === 'week') {
        const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0);
        return d >= start;
      }
      if (filterPeriod === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (filterPeriod === 'year') return d.getFullYear() === now.getFullYear();
      return true;
    });
  }, [transactions, filterPeriod]);
}

export function getWalletCurrency(wallets: any[], walletId: string): string {
  return wallets.find((w) => w.id === walletId)?.currency || 'BDT';
}

export function useDerived(txList?: Transaction[]) {
  const { wallets: rawWallets, transactions, preferredCurrency } = useAppStore();
  const wallets = useMemo(() => sortWallets(rawWallets), [rawWallets]);
  const txs = txList || transactions;

  return useMemo(() => {
    const totalBalance = wallets.reduce(
      (sum, w) => sum + convertToPreferred(w.balance || 0, w.currency || 'BDT', preferredCurrency), 0
    );
    const getAmt = (tx: Transaction) => convertToPreferred(tx.amount || 0, getWalletCurrency(wallets, tx.walletId), preferredCurrency);

    // Transfers are excluded from income/expense/profit calculations
    const nonTransfer = txs.filter(t => t.type !== 'transfer');
    const totalIncome   = nonTransfer.filter((t) => t.type === 'income').reduce((s, t) => s + getAmt(t), 0);
    const totalExpenses = nonTransfer.filter((t) => t.type === 'expense').reduce((s, t) => s + getAmt(t), 0);
    const totalDebt     = nonTransfer.filter((t) => t.type === 'debt').reduce((s, t) => s + getAmt(t), 0);
    const totalLent     = nonTransfer.filter((t) => t.type === 'lent').reduce((s, t) => s + getAmt(t), 0);

    const expenseMap: Record<string, number> = {};
    nonTransfer.filter((t) => t.type === 'expense').forEach((t) => {
      const cat = t.category || 'Other';
      expenseMap[cat] = (expenseMap[cat] || 0) + getAmt(t);
    });
    const pieData = Object.entries(expenseMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value, color: CATEGORY_COLORS[name] || '#94a3b8' }));

    return { totalBalance, totalIncome, totalExpenses, totalDebt, totalLent, pieData };
  }, [wallets, txs, preferredCurrency]);
}

export function useMonthlyTotals() {
  const { transactions, wallets: rawWallets, preferredCurrency } = useAppStore();
  const wallets = useMemo(() => sortWallets(rawWallets), [rawWallets]);
  return useMemo(() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const yr = new Date().getFullYear();
    return months.map((month, m) => {
      const ym = `${yr}-${String(m + 1).padStart(2, '0')}`;
      const getAmt = (tx: Transaction) => convertToPreferred(tx.amount || 0, getWalletCurrency(wallets, tx.walletId), preferredCurrency);
      // Exclude transfers from monthly totals
      const income   = transactions.filter((t) => t.date?.startsWith(ym) && t.type === 'income').reduce((s, t) => s + getAmt(t), 0);
      const expenses = transactions.filter((t) => t.date?.startsWith(ym) && t.type === 'expense').reduce((s, t) => s + getAmt(t), 0);
      return { month, income, expenses };
    });
  }, [transactions, wallets, preferredCurrency]);
}
