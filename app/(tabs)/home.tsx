// app/(tabs)/home.tsx
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Pressable, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';
import { useProfiles } from '@/hooks/useProfiles';
import { useDeleteTransaction } from '@/hooks/useDeleteTransaction';
import { useFilteredTransactions } from '@/hooks/useDerived';
import { fmtCurrency, convertToPreferred } from '@/lib/currency';
import { COLORS, SHADOW } from '@/constants/theme';
import WalletStrip from '@/components/dashboard/WalletStrip';
import HeroBalanceCard from '@/components/dashboard/HeroBalanceCard';
import { SyncIndicator } from '@/components/ui/SyncIndicator';
import { TxDetailModal } from '@/components/ui/TxDetailModal';
import { TransactionCard } from '@/components/cards/TransactionCard';
import { useProfilesStore } from '@/store/useProfilesStore';
import { SummaryModal, StatType } from '@/components/modals/SummaryModal';
import { sortWallets } from '@/utils/walletSort';

// ── Period filter ─────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year',  label: 'Yearly' },
];

function PeriodFilterBar({
  value, onChange,
}: { value: Period; onChange: (p: Period) => void }) {
  return (
    <View style={pf.row}>
      {PERIODS.map(p => {
        const active = p.key === value;
        return (
          <Pressable
            key={p.key}
            style={[pf.pill, active && pf.pillActive]}
            onPress={() => onChange(p.key)}
            android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false }}
          >
            <Text style={[pf.text, active && pf.textActive]}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const pf = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 14,
  },
  pill:       { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  pillActive: {
    backgroundColor: 'rgba(16,185,129,0.75)',
    shadowColor: '#10b981', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
  },
  text:       { color: COLORS.textFaint, fontSize: 12.5, fontWeight: '600' },
  textActive: { color: '#fff', fontWeight: '800' },
});

// ── AnimCard ──────────────────────────────────────────────────────────────────

function AnimCard({ children, delay = 0, triggerKey }: { children: React.ReactNode; delay?: number; triggerKey?: number }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    opacity.setValue(0); translateY.setValue(24);
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 420, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, damping: 20, stiffness: 140 }),
    ]).start();
  }, [triggerKey]);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

// ── Financial Profiles summary card ──────────────────────────────────────────

function FinancialProfilesCard({ onPress }: { onPress: () => void }) {
  const { profiles }         = useProfilesStore();
  const { preferredCurrency } = useAppStore();

  const totalOwed = profiles
    .filter(p => p.currentBalance > 0)
    .reduce((s, p) => s + p.currentBalance, 0);
  const totalReceivable = profiles
    .filter(p => p.currentBalance < 0)
    .reduce((s, p) => s + Math.abs(p.currentBalance), 0);
  const activeCount = profiles.filter(p => Math.abs(p.currentBalance) > 0.009).length;

  return (
    <View style={fp.cardShadow}>
      <TouchableOpacity style={fp.card} onPress={onPress} activeOpacity={0.82}>
        <LinearGradient
          colors={['rgba(249,115,22,0.07)', 'transparent', 'rgba(59,130,246,0.07)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      <View style={fp.topStrip}>
        <View style={fp.stripLeft} />
        <View style={fp.stripRight} />
      </View>
      <View style={fp.header}>
        <View style={fp.iconWrap}>
          <Ionicons name="people" size={17} color="#e2e8f0" />
        </View>
        <Text style={fp.title}>Debt & Lending</Text>
        {activeCount > 0 && (
          <View style={fp.activePill}>
            <Text style={fp.activePillText}>{activeCount} active</Text>
          </View>
        )}
        <View style={fp.chevronWrap}>
          <Ionicons name="chevron-forward" size={14} color="#64748b" />
        </View>
      </View>
      {profiles.length === 0 ? (
        <View style={fp.emptyRow}>
          <Text style={fp.emptyText}>Tap to add your first profile</Text>
        </View>
      ) : (
        <View style={fp.statsRow}>
          <View style={fp.statBlock}>
            <View style={[fp.statHeader, { backgroundColor: 'rgba(249,115,22,0.12)' }]}>
              <View style={[fp.statDot, { backgroundColor: '#f97316' }]} />
              <Text style={[fp.statTag, { color: '#f97316' }]}>DEBT</Text>
            </View>
            <Text style={[fp.statAmt, { color: '#f97316' }]}>
              {totalOwed > 0.009
                ? fmtCurrency(convertToPreferred(totalOwed, 'BDT', preferredCurrency), preferredCurrency)
                : '—'}
            </Text>
            <Text style={fp.statLabel}>You Owe</Text>
          </View>
          <View style={fp.divider} />
          <View style={fp.statBlock}>
            <View style={[fp.statHeader, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
              <View style={[fp.statDot, { backgroundColor: '#3b82f6' }]} />
              <Text style={[fp.statTag, { color: '#3b82f6' }]}>LENT</Text>
            </View>
            <Text style={[fp.statAmt, { color: '#3b82f6' }]}>
              {totalReceivable > 0.009
                ? fmtCurrency(convertToPreferred(totalReceivable, 'BDT', preferredCurrency), preferredCurrency)
                : '—'}
            </Text>
            <Text style={fp.statLabel}>Owed to You</Text>
          </View>
          <View style={fp.divider} />
          <View style={fp.statBlock}>
            <View style={[fp.statHeader, { backgroundColor: 'rgba(148,163,184,0.08)' }]}>
              <View style={[fp.statDot, { backgroundColor: '#94a3b8' }]} />
              <Text style={[fp.statTag, { color: '#94a3b8' }]}>TOTAL</Text>
            </View>
            <Text style={[fp.statAmt, { color: '#94a3b8' }]}>{profiles.length}</Text>
            <Text style={fp.statLabel}>Profiles</Text>
          </View>
        </View>
      )}
      </TouchableOpacity>
    </View>
  );
}
const fp = StyleSheet.create({
  cardShadow: {
    marginHorizontal: 16, marginBottom: 16, borderRadius: 20,
    backgroundColor: COLORS.cardElevated,
    ...SHADOW.card,
  },
  card: {
    borderRadius: 20, overflow: 'hidden',
  },
  topStrip:       { flexDirection: 'row', height: 3 },
  stripLeft:      { flex: 1, backgroundColor: '#f97316', borderTopLeftRadius: 20 },
  stripRight:     { flex: 1, backgroundColor: '#3b82f6', borderTopRightRadius: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
  },
  iconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  title:          { color: COLORS.text, fontSize: 15, fontWeight: '800', flex: 1, letterSpacing: -0.3 },
  activePill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.10)' },
  activePillText: { color: COLORS.textSlate, fontSize: 10, fontWeight: '600' },
  chevronWrap:    { width: 24, height: 24, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  statsRow: {
    flexDirection: 'row', alignItems: 'stretch',
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 14, overflow: 'hidden',
  },
  statBlock:  { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6, gap: 4 },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginBottom: 4 },
  statDot:    { width: 5, height: 5, borderRadius: 2.5 },
  statTag:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  statAmt:    { fontSize: 14, fontWeight: '900', letterSpacing: -0.5 },
  statLabel:  { color: COLORS.textFaint, fontSize: 10, fontWeight: '500' },
  divider:    { width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12 },
  emptyRow:   { paddingVertical: 14, paddingHorizontal: 16, paddingBottom: 18, alignItems: 'center' },
  emptyText:  { color: COLORS.textFaint, fontSize: 12 },
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { transactions, wallets: rawWallets, preferredCurrency, filterPeriod, setFilterPeriod } = useAppStore();
  const wallets = useMemo(() => sortWallets(rawWallets), [rawWallets]);
  const { deleteTransaction } = useDeleteTransaction();
  const { hydrateProfiles } = useProfiles();
  const filteredTxs = useFilteredTransactions();
  const [triggerKey, setTriggerKey] = useState(0);

  // Summary modal state — type drives what SummaryModal shows
  const [summaryType, setSummaryType] = useState<StatType | null>(null);

  // Tx detail for Recent Transactions section
  const [selectedTx, setSelectedTx]   = useState<any>(null);
  const [txDetailVisible, setTxDetail] = useState(false);

  // Refresh animations + financial profiles on tab focus
  useFocusEffect(useCallback(() => {
    setTriggerKey(k => k + 1);
    hydrateProfiles();
  }, []));

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Delete handler — delegates entirely to the shared useDeleteTransaction hook.
  // Handles transfer reversal, wallet balance reversal, linked profile-tx cleanup,
  // and legacy lending/debts cleanup in one place.
  async function handleDeleteTx(txId: string) {
    await deleteTransaction(txId, () => setTxDetail(false));
  }

  const recentTxs = useMemo(() => filteredTxs.slice(0, 6), [filteredTxs]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page Header */}
        <AnimCard delay={0} triggerKey={triggerKey}>
          <View style={styles.pageHeader}>
            <View>
              <Text style={styles.dateText}>{today}</Text>
              <Text style={styles.pageTitle}>Dashboard</Text>
            </View>
            <SyncIndicator />
          </View>
        </AnimCard>

        {/* ── Period Filter */}
        <AnimCard delay={40} triggerKey={triggerKey}>
          <PeriodFilterBar
            value={filterPeriod as Period}
            onChange={v => setFilterPeriod(v)}
          />
        </AnimCard>

        {/* ── Hero Balance Card — stat tiles are tappable */}
        <AnimCard delay={80} triggerKey={triggerKey}>
          <View style={styles.heroCardWrap}>
            <HeroBalanceCard
              onStatPress={type => setSummaryType(type)}
            />
          </View>
        </AnimCard>

        {/* ── Wallet Strip */}
        <AnimCard delay={160} triggerKey={triggerKey}>
          <WalletStrip />
        </AnimCard>

        {/* ── Financial Profiles (Debt & Lending) */}
        <AnimCard delay={220} triggerKey={triggerKey}>
          <FinancialProfilesCard onPress={() => router.push('/debt-lending' as any)} />
        </AnimCard>

        {/* ── Recent Transactions */}
        <AnimCard delay={280} triggerKey={triggerKey}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Recent Transactions</Text>
            </View>
            {recentTxs.length === 0 ? (
              <View style={styles.dlEmpty}>
                <Text style={styles.dlEmptyText}>No transactions in this period</Text>
              </View>
            ) : recentTxs.map(tx => (
              <TransactionCard
                key={tx.id}
                tx={tx}
                wallets={wallets}
                onPress={() => { setSelectedTx(tx); setTxDetail(true); }}
                style={{ marginBottom: 8 }}
              />
            ))}
          </View>
        </AnimCard>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Summary modal — opens from HeroBalanceCard stat press */}
      <SummaryModal
        visible={summaryType !== null}
        type={summaryType}
        initialPeriod={filterPeriod}
        onClose={() => setSummaryType(null)}
      />

      {/* ── Tx detail for Recent Transactions */}
      <TxDetailModal
        tx={selectedTx}
        visible={txDetailVisible}
        onClose={() => setTxDetail(false)}
        onDelete={handleDeleteTx}
        wallets={wallets}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  scroll:       { flex: 1 },
  content:      { paddingBottom: 12 },
  pageHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 14, marginBottom: 14,
  },
  dateText:     { color: COLORS.textMuted, fontSize: 10, marginBottom: 2 },
  pageTitle:    { color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.8 },
  heroCardWrap: { marginHorizontal: 16 },
  card: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 20, padding: 18, marginHorizontal: 16, marginBottom: 16,
    ...SHADOW.card,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  cardTitle:    { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  dlEmpty:      { alignItems: 'center', paddingVertical: 24 },
  dlEmptyText:  { color: COLORS.textFaint, fontSize: 13 },
});
