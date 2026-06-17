// app/(tabs)/transactions.tsx — Transfer-aware: filter, display, delete

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, FlatList, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { useDeleteTransaction } from '@/hooks/useDeleteTransaction';
import { CATEGORY_ICONS, ALL_CATEGORIES, TX_TYPE_COLOR } from '@/constants/data';
import { COLORS, RADIUS } from '@/constants/theme';
import { TxDetailModal } from '@/components/ui/TxDetailModal';
import { TransactionCard } from '@/components/cards/TransactionCard';
import { sortWallets } from '@/utils/walletSort';

const TYPE_FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'income',   label: 'Income' },
  { key: 'expense',  label: 'Expense' },
  { key: 'debt',     label: 'Debt' },
  { key: 'lent',     label: 'Lent' },
  { key: 'transfer', label: 'Transfer' },
];

export default function TransactionsScreen() {
  const {
    transactions, wallets,
    txTypeFilter, filterCategory,
    setTxTypeFilter, setFilterCategory,
  } = useAppStore();

  const { deleteTransaction } = useDeleteTransaction();
  const sortedWallets = useMemo(() => sortWallets(wallets), [wallets]);

  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [txDetailVisible, setTxDetailVisible] = useState(false);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const fromWallet = sortedWallets.find(w => w.id === tx.fromWalletId);
      const toWallet   = sortedWallets.find(w => w.id === tx.toWalletId);
      const searchTarget = [
        tx.title, tx.category, tx.personName,
        fromWallet?.name, toWallet?.name,
      ].filter(Boolean).join(' ').toLowerCase();

      const matchSearch  = searchTarget.includes(search.toLowerCase());
      const matchType    = txTypeFilter === 'all' || tx.type === txTypeFilter;
      const matchCat     = filterCategory === 'all' || tx.category === filterCategory;
      return matchSearch && matchType && matchCat;
    });
  }, [transactions, search, txTypeFilter, filterCategory, sortedWallets]);

  async function handleDeleteTx(txId: string) {
    await deleteTransaction(txId, () => setTxDetailVisible(false));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Transactions</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions..."
          placeholderTextColor={COLORS.textFaint}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClear}>
            <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Type Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll} contentContainerStyle={styles.typeRow}>
        {TYPE_FILTERS.map((f) => {
          const active   = txTypeFilter === f.key;
          const color    = TX_TYPE_COLOR[f.key] || '#fff';
          const activeBg = f.key === 'all' ? 'rgba(255,255,255,0.12)' : color + '25';
          return (
            <TouchableOpacity
              key={f.key} activeOpacity={0.75}
              onPress={() => setTxTypeFilter(f.key as any)}
              style={[styles.typePill, active && { backgroundColor: activeBg }]}
            >
              <Text style={[styles.typePillText, active && { color }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Category Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catRow}>
        {['all', ...ALL_CATEGORIES].map((c) => {
          const active = filterCategory === c;
          return (
            <TouchableOpacity
              key={c} activeOpacity={0.75}
              onPress={() => setFilterCategory(c)}
              style={[styles.catPill, active && styles.catPillActive]}
            >
              <Text style={[styles.catPillText, active && styles.catPillTextActive]}>
                {c === 'all' ? 'All' : `${CATEGORY_ICONS[c] || ''} ${c}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Transaction list */}
      <FlatList
        style={{ flex: 1 }}
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No transactions found</Text>
          </View>
        }
        renderItem={({ item: tx }) => (
          <TransactionCard
            tx={tx}
            wallets={sortedWallets}
            onPress={() => { setSelectedTx(tx); setTxDetailVisible(true); }}
          />
        )}
      />

      <TxDetailModal
        tx={selectedTx}
        visible={txDetailVisible}
        onClose={() => setTxDetailVisible(false)}
        onDelete={handleDeleteTx}
        wallets={sortedWallets}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: COLORS.background },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  pageTitle:     { color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  searchWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: RADIUS.sm, marginHorizontal: 16, marginBottom: 14, paddingHorizontal: 12 },
  searchIcon:    { marginRight: 8 },
  searchInput:   { flex: 1, paddingVertical: 12, color: COLORS.text, fontSize: 14 },
  searchClear:   { paddingLeft: 8 },
  typeScroll:    { marginBottom: 10, maxHeight: 44, minHeight: 44 },
  typeRow:       { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  typePill:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.06)' },
  typePillText:  { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  catScroll:     { marginBottom: 14, maxHeight: 40, minHeight: 40 },
  catRow:        { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  catPill:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.04)', height: 30, justifyContent: 'center', flexShrink: 0 },
  catPillActive: { backgroundColor: 'rgba(59,130,246,0.2)' },
  catPillText:   { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  catPillTextActive: { color: '#3b82f6' },
  listContent:   { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
  emptyWrap:     { paddingVertical: 60, alignItems: 'center' },
  emptyText:     { color: COLORS.textFaint, fontSize: 14 },
});
