// components/dashboard/HeroBalanceCard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '@/store/useAppStore';
import { useDerived, useFilteredTransactions } from '@/hooks/useDerived';
import { fmtPreferred } from '@/lib/currency';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';
import { PressCard } from '@/components/ui/PressRow';
import type { StatType } from '@/components/modals/SummaryModal';

const STAT_CFG = [
  { key: 'income'  as StatType, label: 'INCOME',   color: '#10b981', icon: '↑' },
  { key: 'expense' as StatType, label: 'EXPENSES',  color: '#ef4444', icon: '↓' },
  { key: 'debt'    as StatType, label: 'DEBT',      color: '#f97316', icon: '↙' },
  { key: 'lent'    as StatType, label: 'LENT',      color: '#3b82f6', icon: '↗' },
];

interface Props {
  onStatPress?: (type: StatType) => void;
}

export default function HeroBalanceCard({ onStatPress }: Props) {
  const { preferredCurrency } = useAppStore();
  const filteredTxs = useFilteredTransactions();
  const { totalBalance, totalIncome, totalExpenses, totalDebt, totalLent } = useDerived(filteredTxs);

  const values: Record<StatType, number> = {
    income: totalIncome, expense: totalExpenses, debt: totalDebt, lent: totalLent,
  };

  return (
    <View style={styles.card}>
      {/* Deep dark base */}
      <LinearGradient
        colors={['#0d1520', '#080d18']}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle green top glow only */}
      <LinearGradient
        colors={['rgba(0, 37, 28, 0)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.label}>
          TOTAL BALANCE{'  '}
          <Text style={styles.badge}>{preferredCurrency}</Text>
        </Text>
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
          {fmtPreferred(totalBalance, preferredCurrency)}
        </Text>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live balance across all wallets</Text>
        </View>

        {/* Stats 2×2 grid */}
        <View style={styles.statsGrid}>
          {STAT_CFG.map((s) => (
            <PressCard
              key={s.key}
              style={styles.statCell}
              onPress={() => onStatPress?.(s.key)}
            >
              <View style={styles.statInner}>
                <View style={styles.statLabelRow}>
                  <Text style={[styles.statIcon, { color: s.color }]}>{s.icon}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
                <Text style={[styles.statValue, { color: s.color }]}>
                  {fmtPreferred(values[s.key], preferredCurrency)}
                </Text>
              </View>
            </PressCard>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: 20,
    ...SHADOW.card,
  },
  content:      { padding: 24, paddingTop: 26 },
  label:        { color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  badge:        { color: '#10b981', fontSize: 10, letterSpacing: 1 },
  amount:       { color: '#fff', fontSize: 37, fontWeight: '900', letterSpacing: -2, lineHeight: 48, marginBottom: 10 },
  liveBadge:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, gap: 6, marginBottom: 20 },
  liveDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  liveText:     { color: '#10b981', fontSize: 9, fontWeight: '600' },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  statCell:     { width: '50%', paddingHorizontal: 5, marginBottom: 10 },
  statInner:    { backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: RADIUS.md, padding: 12 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  statIcon:     { fontSize: 13, fontWeight: '700' },
  statLabel:    { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  statValue:    { fontSize: 15, fontWeight: '800' },
});