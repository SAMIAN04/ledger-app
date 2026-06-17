// components/modals/SummaryModal.tsx
// Type-filtered transaction summary sheet — opens when user taps hero stats
import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable,
  TouchableOpacity, Animated, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { useDeleteTransaction } from '@/hooks/useDeleteTransaction';
import { fmtCurrency, convertToPreferred } from '@/lib/currency';
import { COLORS, RADIUS } from '@/constants/theme';
import { TxDetailModal } from '@/components/ui/TxDetailModal';
import { GlowOrb } from '@/components/ui/GlassModal';
import { TransactionCard } from '@/components/cards/TransactionCard';
import { sortWallets } from '@/utils/walletSort';
import { FilterPeriod } from '@/types';
import { SHADOW } from '@/constants/theme';

// ── Types ──────────────────────────────────────────────────────────────────

export type StatType = 'income' | 'expense' | 'debt' | 'lent';
type Period = 'today' | 'week' | 'month' | 'year';

const TYPE_META: Record<StatType, { label: string; icon: string; color: string }> = {
  income:  { label: 'Income',   icon: '↑',  color: '#10b981' },
  expense: { label: 'Expenses', icon: '↓',  color: '#ef4444' },
  debt:    { label: 'Debt',     icon: '💸', color: '#f97316' },
  lent:    { label: 'Lent',     icon: '🤝', color: '#3b82f6' },
};

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today'   },
  { key: 'week',  label: 'Weekly'  },
  { key: 'month', label: 'Monthly' },
  { key: 'year',  label: 'Yearly'  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function filterByPeriod(txs: any[], period: Period): any[] {
  const now = new Date();
  return txs.filter(t => {
    if (!t.date) return false;
    const d = new Date(t.date);
    if (period === 'today') return d.toDateString() === now.toDateString();
    if (period === 'week') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(now.getDate() - 6);
      return d >= start;
    }
    if (period === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return d.getFullYear() === now.getFullYear();
  });
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  type: StatType | null;
  initialPeriod?: FilterPeriod;
  onClose: () => void;
}

export function SummaryModal({ visible, type, initialPeriod = 'month', onClose }: Props) {
  const slideY  = useRef(new Animated.Value(500)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [period, setPeriod]             = useState<Period>(initialPeriod as Period);
  const [selectedTx, setSelectedTx]     = useState<any>(null);
  const [txDetailVisible, setTxDetail]  = useState(false);

  const { transactions, wallets: rawWallets, preferredCurrency } = useAppStore();
  const wallets = useMemo(() => sortWallets(rawWallets), [rawWallets]);
  const { deleteTransaction } = useDeleteTransaction();

  // Animate in + sync period whenever the sheet opens
  useEffect(() => {
    if (visible) {
      setPeriod(initialPeriod as Period);
      slideY.setValue(500);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }),
      ]).start();
    }
  }, [visible, initialPeriod]);

  // Transactions for this type × period
  const typedTxs = useMemo(() => {
    if (!type) return [];
    return filterByPeriod(transactions.filter(t => t.type === type), period);
  }, [transactions, type, period]);

  // Total in preferred currency
  const total = useMemo(() =>
    typedTxs.reduce((s, t) => {
      const c = wallets.find(w => w.id === t.walletId)?.currency || 'BDT';
      return s + convertToPreferred(t.amount || 0, c, preferredCurrency);
    }, 0),
  [typedTxs, wallets, preferredCurrency]);

  // Delete — delegates to shared useDeleteTransaction hook which handles
  // transfer reversal, wallet balance correction, and linked profile cleanup.
  async function handleDeleteTx(txId: string) {
    await deleteTransaction(txId, () => setTxDetail(false));
  }

  if (!type) return null;
  const meta = TYPE_META[type];

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      animationType="none"
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <Animated.View style={[s.sheet, { opacity, transform: [{ translateY: slideY }] }]}>
          {/* Stop overlay tap from closing when tapping inside */}
          <Pressable>
            {/* Background */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.sheet }]} />

            {/* Ambient glow, tinted with the stat type's color */}
            <View style={{ position: 'absolute', top: -50, right: -50, alignItems: 'center', justifyContent: 'center' }}>
              <GlowOrb color={meta.color} size={180} />
            </View>

            {/* Handle */}
            <View style={s.handle} />

            {/* ── Header ── */}
            <View style={s.headerRow}>
              <View style={[s.iconCircle, { backgroundColor: meta.color + '22' }]}>
                <Text style={s.iconText}>{meta.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{meta.label}</Text>
                <Text style={[s.sheetTotal, { color: meta.color }]}>
                  {fmtCurrency(total, preferredCurrency)}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={COLORS.textFaint} />
              </TouchableOpacity>
            </View>

            {/* ── Period filter ── */}
            <View style={s.periodRow}>
              {PERIODS.map(p => {
                const active = p.key === period;
                return (
                  <Pressable
                    key={p.key}
                    style={[s.periodPill, active && s.periodPillActive]}
                    onPress={() => setPeriod(p.key)}
                    android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false }}
                  >
                    <Text style={[s.periodText, active && s.periodTextActive]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Count badge */}
            {typedTxs.length > 0 && (
              <View style={s.countBadge}>
                <Text style={s.countText}>
                  {typedTxs.length} transaction{typedTxs.length !== 1 ? 's' : ''}
                </Text>
              </View>
            )}

            {/* ── Transaction list ── */}
            {typedTxs.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>📭</Text>
                <Text style={s.emptyTitle}>No {meta.label.toLowerCase()}</Text>
                <Text style={s.emptySubtitle}>Nothing recorded in this period</Text>
              </View>
            ) : (
              <FlatList
                data={typedTxs}
                keyExtractor={i => i.id}
                style={s.list}
                contentContainerStyle={s.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: tx }) => (
                  <TransactionCard
                    tx={tx}
                    wallets={wallets}
                    onPress={() => { setSelectedTx(tx); setTxDetail(true); }}
                  />
                )}
              />
            )}

            <View style={{ height: 32 }} />
          </Pressable>
        </Animated.View>
      </Pressable>

      {/* Tx detail sheet — nested Modal, renders on top of summary sheet */}
      <TxDetailModal
        tx={selectedTx}
        visible={txDetailVisible}
        onClose={() => setTxDetail(false)}
        onDelete={handleDeleteTx}
        wallets={wallets}
      />
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    maxHeight: '85%',
    ...SHADOW.sheet,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 14, marginBottom: 20,
  },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, marginBottom: 18,
  },
  iconCircle: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText:   { fontSize: 22 },
  sheetTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  sheetTotal: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  closeBtn:   { padding: 8 },

  periodRow: {
    flexDirection: 'row', gap: 8,
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 4, borderRadius: 14,
  },
  periodPill: {
    flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center',
  },
  periodPillActive: {
    backgroundColor: 'rgba(16,185,129,0.75)',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  periodText:       { color: COLORS.textFaint, fontSize: 12.5, fontWeight: '600' },
  periodTextActive: { color: '#fff', fontWeight: '800' },

  countBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
  },
  countText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },

  empty: {
    alignItems: 'center',
    paddingVertical: 48, paddingHorizontal: 24,
  },
  emptyIcon:     { fontSize: 36, marginBottom: 12 },
  emptyTitle:    { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { color: COLORS.textFaint, fontSize: 13 },

  list:        { maxHeight: 380 },
  listContent: { paddingHorizontal: 16, paddingBottom: 4, gap: 8 },
});
