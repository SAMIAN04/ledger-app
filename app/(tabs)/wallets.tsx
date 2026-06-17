// app/(tabs)/wallets.tsx — with long-press reordering (action sheet)
import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { useFirestore } from '@/hooks/useFirestore';
import { fmtCurrency } from '@/lib/currency';
import { WALLET_EMOJI } from '@/constants/data';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';
import { sortWallets } from '@/utils/walletSort';
import { PressCard } from '@/components/ui/PressRow';

export default function WalletsScreen() {
  const { wallets, transactions } = useAppStore();
  const { fbReorderWallets } = useFirestore();
  const router = useRouter();

  const sortedWallets = useMemo(() => sortWallets(wallets), [wallets]);

  function showReorderSheet(walletId: string) {
    const idx = sortedWallets.findIndex(w => w.id === walletId);
    const total = sortedWallets.length;
    if (total < 2) return;

    const wallet = sortedWallets[idx];
    const canUp   = idx > 0;
    const canDown = idx < total - 1;

    const options: { text: string; onPress?: () => void }[] = [];

    if (canUp)   options.push({ text: 'Move Up',      onPress: () => move(idx, idx - 1) });
    if (canDown) options.push({ text: 'Move Down',    onPress: () => move(idx, idx + 1) });
    if (canUp)   options.push({ text: 'Move to Top',  onPress: () => move(idx, 0) });
    if (canDown) options.push({ text: 'Move to Bottom', onPress: () => move(idx, total - 1) });
    options.push({ text: 'Cancel' });

    Alert.alert(
      `Reorder "${wallet.name}"`,
      'Choose where to move this wallet:',
      options.map(o =>
        o.onPress
          ? { text: o.text, onPress: o.onPress }
          : { text: o.text, style: 'cancel' as const }
      ),
    );
  }

  async function move(fromIdx: number, toIdx: number) {
    const reordered = [...sortedWallets];
    const [item] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, item);
    const orderedIds = reordered.map(w => w.id);
    await fbReorderWallets(orderedIds);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Wallets</Text>
        <TouchableOpacity
          onPress={() => router.push('/modals/add-wallet' as any)}
          activeOpacity={0.85}
          style={styles.addBtnWrap}
        >
          <LinearGradient
            colors={['#10b981', '#059669']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>+ Add Wallet</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {sortedWallets.length > 1 && (
        <Text style={styles.reorderHint}>Long-press a wallet card to reorder</Text>
      )}

      <FlatList
        data={sortedWallets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>💳</Text>
            <Text style={styles.emptyText}>No wallets yet.</Text>
            <TouchableOpacity onPress={() => router.push('/modals/add-wallet' as any)}>
              <Text style={styles.emptyLink}>Add your first wallet →</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item: w, index }) => {
          const txs = transactions.filter((t) => t.walletId === w.id);
          // Only count income/expense — exclude transfers from stats
          const inc = txs.filter((t) => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
          const exp = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
          const sym = w.currency || 'BDT';

          return (
            <PressCard
              style={styles.cardWrap}
              onPress={() => router.push({ pathname: '/modals/wallet-detail' as any, params: { walletId: w.id } })}
              onLongPress={() => showReorderSheet(w.id)}
            >
              <LinearGradient
                colors={[w.color + '22', w.color + '08']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.iconWrap, { backgroundColor: w.color + '33' }]}>
                    {w.logo ? (
                      <Image source={{ uri: w.logo }} style={styles.logo} />
                    ) : (
                      <Text style={styles.emoji}>{WALLET_EMOJI[w.type] || '💰'}</Text>
                    )}
                  </View>
                  <View style={styles.nameWrap}>
                    <Text style={styles.walletName}>{w.name}</Text>
                    <Text style={styles.walletType}>{w.type} · {w.currency}</Text>
                  </View>
                  {/* Order badge */}
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderText}>#{index + 1}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/modals/wallet-detail' as any, params: { walletId: w.id, edit: '1' } })}
                    style={styles.editBtn} activeOpacity={0.7}
                  >
                    <Ionicons name="pencil-outline" size={12} color={COLORS.textSlate} />
                    <Text style={styles.editText}>Edit</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.balance}>{fmtCurrency(w.balance || 0, sym)}</Text>

                <View style={styles.statsRow}>
                  <View style={styles.statIn}>
                    <Text style={styles.statLabel}>IN</Text>
                    <Text style={[styles.statValue, { color: '#10b981' }]}>{fmtCurrency(inc, sym)}</Text>
                  </View>
                  <View style={styles.statOut}>
                    <Text style={styles.statLabel}>OUT</Text>
                    <Text style={[styles.statValue, { color: '#ef4444' }]}>{fmtCurrency(exp, sym)}</Text>
                  </View>
                </View>

                {!!w.description && <Text style={styles.desc}>{w.description}</Text>}
                <Text style={styles.txCount}>{txs.length} transaction{txs.length !== 1 ? 's' : ''}</Text>
              </LinearGradient>
            </PressCard>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: COLORS.background },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  pageTitle:  { color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  reorderHint:{ color: COLORS.textFaint, fontSize: 11, paddingHorizontal: 16, marginBottom: 10 },
  addBtnWrap: { borderRadius: RADIUS.md, overflow: 'hidden' },
  addBtn:     { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.md },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  grid:       { paddingHorizontal: 16, paddingBottom: 100 },
  emptyWrap:  { paddingVertical: 60, alignItems: 'center', gap: 8 },
  emptyIcon:  { fontSize: 48 },
  emptyText:  { color: COLORS.textFaint, fontSize: 15 },
  emptyLink:  { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  cardWrap:   { marginBottom: 12 },
  card:       { borderRadius: RADIUS.xl, padding: 18, ...SHADOW.card },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  iconWrap:   { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  logo:       { width: 44, height: 44, borderRadius: 14 },
  emoji:      { fontSize: 22 },
  nameWrap:   { flex: 1 },
  walletName: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 15 },
  walletType: { color: COLORS.textFaint, fontSize: 11, textTransform: 'capitalize', marginTop: 2 },
  orderBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  orderText:  { color: COLORS.textFaint, fontSize: 10, fontWeight: '600' },
  editBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  editText:   { color: COLORS.textSlate, fontSize: 12, fontWeight: '600' },
  balance:    { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 14 },
  statsRow:   { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statIn:     { flex: 1, borderRadius: 10, padding: 8, backgroundColor: 'rgba(16,185,129,0.10)' },
  statOut:    { flex: 1, borderRadius: 10, padding: 8, backgroundColor: 'rgba(239,68,68,0.10)' },
  statLabel:  { color: COLORS.textFaint, fontSize: 10, marginBottom: 2 },
  statValue:  { fontWeight: '700', fontSize: 14 },
  desc:       { color: COLORS.textFaint, fontSize: 11, marginTop: 4 },
  txCount:    { color: COLORS.textFaint, fontSize: 11, marginTop: 8 },
});
