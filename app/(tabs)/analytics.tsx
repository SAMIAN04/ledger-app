// app/(tabs)/analytics.tsx
import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Dimensions, Animated, Image, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Svg, {
  Path, Circle, Line, Defs,
  LinearGradient as SvgGradient, Stop,
  Text as SvgText, G,
} from 'react-native-svg';
import { useAppStore } from '@/store/useAppStore';
import { getWalletCurrency } from '@/hooks/useDerived';
import { fmtPreferred, convertToPreferred } from '@/lib/currency';
import { sortWallets } from '@/utils/walletSort';
import { CATEGORY_COLORS, CATEGORY_ICONS, WALLET_EMOJI } from '@/constants/data';
import { COLORS, SHADOW } from '@/constants/theme';

const { width: SW } = Dimensions.get('window');
const CARD_PAD = 18;
const CHART_W = SW - 32 - CARD_PAD * 2;

// ─── Period ───────────────────────────────────────────────
type Period = 'today' | 'weekly' | 'monthly' | 'yearly';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];
const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function txDate(t: any): Date {
  if (t.date instanceof Date) return t.date;
  if (typeof t.date === 'string' && t.date) return new Date(t.date);
  if (t.createdAt instanceof Date) return t.createdAt;
  if (typeof t.createdAt === 'string' && t.createdAt) return new Date(t.createdAt);
  return new Date(0);
}

function isInPeriod(t: any, period: Period, now: Date): boolean {
  const d = txDate(t);
  switch (period) {
    case 'today': return d.toDateString() === now.toDateString();
    case 'weekly': {
      const cutoff = new Date(now);
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - 6);
      return d >= cutoff;
    }
    case 'monthly': return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    case 'yearly': return d.getFullYear() === now.getFullYear();
  }
}

function buildChartData(
  transactions: any[], period: Period, wallets: any[], preferredCurrency: string
): { labels: string[]; income: number[]; expenses: number[] } {
  const now = new Date();
  // Exclude transfers — they don't count as income or expense
  const nonTransfer = transactions.filter(t => t.type !== 'transfer');
  const getAmt = (t: any) =>
    convertToPreferred(t.amount || 0, getWalletCurrency(wallets, t.walletId), preferredCurrency);
  const sum = (txns: any[], type: string) =>
    txns.filter(t => t.type === type).reduce((s, t) => s + getAmt(t), 0);

  if (period === 'today') {
    const slots = [0, 4, 8, 12, 16, 20];
    const slotEnd = [4, 8, 12, 16, 20, 24];
    const todayStr = now.toDateString();
    const dayTxns = nonTransfer.filter(t => txDate(t).toDateString() === todayStr);
    return {
      labels: ['12a', '4a', '8a', '12p', '4p', '8p'],
      income: slots.map((h, i) => sum(dayTxns.filter(t => { const hr = txDate(t).getHours(); return hr >= h && hr < slotEnd[i]; }), 'income')),
      expenses: slots.map((h, i) => sum(dayTxns.filter(t => { const hr = txDate(t).getHours(); return hr >= h && hr < slotEnd[i]; }), 'expense')),
    };
  }
  if (period === 'weekly') {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d;
    });
    return {
      labels: days.map(d => DAYS_S[d.getDay()]),
      income: days.map(d => sum(nonTransfer.filter(t => txDate(t).toDateString() === d.toDateString()), 'income')),
      expenses: days.map(d => sum(nonTransfer.filter(t => txDate(t).toDateString() === d.toDateString()), 'expense')),
    };
  }
  if (period === 'monthly') {
    const m = now.getMonth(), y = now.getFullYear();
    return {
      labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'],
      income: [0, 1, 2, 3].map(wi => { const s = wi * 7 + 1, e = (wi + 1) * 7; return sum(nonTransfer.filter(t => { const d = txDate(t); return d.getMonth() === m && d.getFullYear() === y && d.getDate() >= s && d.getDate() <= e; }), 'income'); }),
      expenses: [0, 1, 2, 3].map(wi => { const s = wi * 7 + 1, e = (wi + 1) * 7; return sum(nonTransfer.filter(t => { const d = txDate(t); return d.getMonth() === m && d.getFullYear() === y && d.getDate() >= s && d.getDate() <= e; }), 'expense'); }),
    };
  }
  const pts = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { m: d.getMonth(), y: d.getFullYear(), label: MONTHS_S[d.getMonth()] };
  });
  return {
    labels: pts.map(p => p.label),
    income: pts.map(p => sum(nonTransfer.filter(t => { const d = txDate(t); return d.getMonth() === p.m && d.getFullYear() === p.y; }), 'income')),
    expenses: pts.map(p => sum(nonTransfer.filter(t => { const d = txDate(t); return d.getMonth() === p.m && d.getFullYear() === p.y; }), 'expense')),
  };
}

// ─── AnimCard ─────────────────────────────────────────────
function AnimCard({ children, delay = 0, style, triggerKey }: {
  children: React.ReactNode; delay?: number; style?: any; triggerKey?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(28)).current;
  useEffect(() => {
    opacity.setValue(0); translateY.setValue(28);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 480, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, damping: 20, stiffness: 140, mass: 0.9 }),
    ]).start();
  }, [triggerKey]);
  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── StatCard ─────────────────────────────────────────────
function StatCard({ label, value, color, delay, triggerKey }: {
  label: string; value: string; color: string; delay: number; triggerKey: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const scale = useRef(new Animated.Value(0.93)).current;
  useEffect(() => {
    opacity.setValue(0); translateY.setValue(18); scale.setValue(0.93);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 420, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, damping: 18, stiffness: 160 }),
      Animated.spring(scale, { toValue: 1, delay, useNativeDriver: true, damping: 16, stiffness: 140 }),
    ]).start();
  }, [triggerKey]);
  return (
    <Animated.View style={[s.statCardShadow, { opacity, transform: [{ translateY }, { scale }] }]}>
      <View style={s.statCard}>
        <View style={[s.statAccent, { backgroundColor: color }]} />
        <Text style={s.statLabel}>{label}</Text>
        <Text style={[s.statValue, { color }]}>{value}</Text>
      </View>
    </Animated.View>
  );
}

// ─── AnimatedLineChart ────────────────────────────────────
function AnimatedLineChart({ incomeData, expenseData, labels, triggerKey }: {
  incomeData: number[]; expenseData: number[]; labels: string[]; triggerKey: number;
}) {
  const [animP, setAnimP] = useState(0);
  const animVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animVal.setValue(0); setAnimP(0);
    const id = animVal.addListener(({ value }) => setAnimP(value));
    Animated.timing(animVal, { toValue: 1, duration: 1100, delay: 320, useNativeDriver: false }).start();
    return () => animVal.removeListener(id);
  }, [triggerKey]);

  const W = CHART_W, H = 195;
  const PL = 10, PR = 8, PT = 18, PB = 34;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const n = labels.length;

  if (n < 2) return (
    <View style={{ height: H, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: COLORS.textFaint, fontSize: 12 }}>Not enough data</Text>
    </View>
  );

  const maxVal = Math.max(...incomeData, ...expenseData, 1);
  const bottomY = PT + plotH;
  const px = (i: number) => PL + (i / (n - 1)) * plotW;
  const py = (v: number) => PT + plotH - (v / maxVal) * animP * plotH;

  function buildCurve(data: number[]): string {
    const pts = data.map((v, i) => [px(i), py(v)]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6, cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6, cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function buildArea(data: number[]): string {
    return `${buildCurve(data)} L${px(n - 1).toFixed(1)},${bottomY.toFixed(1)} L${PL},${bottomY.toFixed(1)} Z`;
  }

  const incLine = buildCurve(incomeData), expLine = buildCurve(expenseData);
  const incArea = buildArea(incomeData), expArea = buildArea(expenseData);
  const gridYs = [0.25, 0.5, 0.75, 1].map(r => PT + plotH - r * plotH);

  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="incGA" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#10b981" stopOpacity="0.30" />
          <Stop offset="1" stopColor="#10b981" stopOpacity="0.00" />
        </SvgGradient>
        <SvgGradient id="expGA" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#f43f5e" stopOpacity="0.24" />
          <Stop offset="1" stopColor="#f43f5e" stopOpacity="0.00" />
        </SvgGradient>
      </Defs>
      {gridYs.map((y, i) => (
        <Line key={i} x1={PL} y1={y} x2={PL + plotW} y2={y}
          stroke="rgba(255,255,255,0.055)" strokeWidth={1} strokeDasharray="3,5" />
      ))}
      {labels.map((l, i) => (
        <SvgText key={i} x={px(i)} y={H - 9} fill="#475569" fontSize={9.5} textAnchor="middle" fontWeight="500">{l}</SvgText>
      ))}
      <Path d={incArea} fill="url(#incGA)" />
      <Path d={expArea} fill="url(#expGA)" />
      <Path d={incLine} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={expLine} fill="none" stroke="#f43f5e" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {incomeData.map((v, i) => (
        <G key={`inc-${i}`}>
          <Circle cx={px(i)} cy={py(v)} r={5.5} fill="#10b981" opacity={0.16} />
          <Circle cx={px(i)} cy={py(v)} r={2.8} fill="#0c1220" stroke="#10b981" strokeWidth={2.2} />
        </G>
      ))}
      {expenseData.map((v, i) => (
        <G key={`exp-${i}`}>
          <Circle cx={px(i)} cy={py(v)} r={5.5} fill="#f43f5e" opacity={0.16} />
          <Circle cx={px(i)} cy={py(v)} r={2.8} fill="#0c1220" stroke="#f43f5e" strokeWidth={2.2} />
        </G>
      ))}
    </Svg>
  );
}

// ─── AnimatedDonut ────────────────────────────────────────
// ONE Animated.Value → ONE setState per frame → zero post-animation blink.
// data is passed as a stable-reference array (memoised in parent).
function AnimatedDonut({ data, total, centerLabel, centerValue, size = 180, triggerKey }: {
  data: { value: number; color: string }[];
  total: number;
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  triggerKey?: number;
}) {
  // Store progress in a ref so the listener closure never captures stale state.
  // We only call setTick to force a re-render; actual value comes from the ref.
  const progressRef = useRef(0);
  const [, setTick] = useState(0);
  const animVal = useRef(new Animated.Value(0)).current;
  const listenerRef = useRef<string | null>(null);

  useEffect(() => {
    // Clean up previous listener
    if (listenerRef.current !== null) {
      animVal.removeListener(listenerRef.current);
      listenerRef.current = null;
    }
    animVal.stopAnimation();
    animVal.setValue(0);
    progressRef.current = 0;

    listenerRef.current = animVal.addListener(({ value }) => {
      progressRef.current = value;
      // Use functional updater so React batches this with other updates
      setTick(t => t + 1);
    });

    Animated.timing(animVal, {
      toValue: 1,
      duration: 900,
      useNativeDriver: false,
    }).start();

    return () => {
      if (listenerRef.current !== null) {
        animVal.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
      animVal.stopAnimation();
    };
  }, [triggerKey, data.length, total]);

  const progress = progressRef.current;
  const CX = size / 2, CY = size / 2;
  const R = size * 0.415;
  const IR = size * 0.285;
  const GAP = 0.018;

  // Build arc paths from current progress — no useMemo so we never get stale arcs
  const arcs: { d: string; color: string }[] = [];
  let angle = -Math.PI / 2;
  for (const slice of data) {
    const frac = total > 0 ? slice.value / total : 0;
    const fullSweep = frac * 2 * Math.PI - GAP;
    const sweep = Math.max(fullSweep * progress, 0);
    if (sweep > 0.001) {
      const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
      const x2 = CX + R * Math.cos(angle + sweep), y2 = CY + R * Math.sin(angle + sweep);
      const x3 = CX + IR * Math.cos(angle + sweep), y3 = CY + IR * Math.sin(angle + sweep);
      const x4 = CX + IR * Math.cos(angle), y4 = CY + IR * Math.sin(angle);
      const lg = sweep > Math.PI ? 1 : 0;
      arcs.push({
        color: slice.color,
        d: `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${lg},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${IR},${IR} 0 ${lg},0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`,
      });
    }
    angle += frac * 2 * Math.PI;
  }

  return (
    <Svg width={size} height={size}>
      <Circle cx={CX} cy={CY} r={(R + IR) / 2}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={R - IR + 1} />
      {arcs.map((arc, i) => <Path key={i} d={arc.d} fill={arc.color} />)}
      {centerLabel && (
        <SvgText x={CX} y={CY - 10} fill="#64748b" fontSize={9}
          textAnchor="middle" fontWeight="700" letterSpacing="1">{centerLabel}</SvgText>
      )}
      {centerValue && (
        <SvgText x={CX} y={CY + 11} fill="#f1f5f9" fontSize={12}
          textAnchor="middle" fontWeight="900">{centerValue}</SvgText>
      )}
    </Svg>
  );
}

// ─── MAIN SCREEN ──────────────────────────────────────────
export default function AnalyticsScreen() {
  const { transactions, wallets, preferredCurrency } = useAppStore();
  const [period, setPeriod] = useState<Period>('monthly');
  const [triggerKey, setTriggerKey] = useState(0);

  useFocusEffect(useCallback(() => { setTriggerKey(k => k + 1); }, []));

  const now = useMemo(() => new Date(), []);

  // Transfers are excluded from ALL analytics — they only move money between wallets
  const filtered = useMemo(
    () => transactions.filter(t => t.type !== 'transfer' && isInPeriod(t, period, now)),
    [transactions, period, now]
  );

  // Sorted wallets — consistent order with all other screens
  const sortedWallets = useMemo(() => sortWallets(wallets), [wallets]);

  const getAmt = useCallback(
    (t: any) => convertToPreferred(t.amount || 0, getWalletCurrency(wallets, t.walletId), preferredCurrency),
    [wallets, preferredCurrency]
  );

  const periodIncome = useMemo(() => filtered.filter(t => t.type === 'income').reduce((s, t) => s + getAmt(t), 0), [filtered, getAmt]);
  const periodExpenses = useMemo(() => filtered.filter(t => t.type === 'expense').reduce((s, t) => s + getAmt(t), 0), [filtered, getAmt]);
  const netFlow = periodIncome - periodExpenses;
  const savingsRate = periodIncome ? Math.round((netFlow / periodIncome) * 100) : 0;

  const chartData = useMemo(
    () => buildChartData(transactions, period, wallets, preferredCurrency),
    [transactions, period, wallets, preferredCurrency]
  );

  const expByCat = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'Other';
      map[cat] = (map[cat] || 0) + getAmt(t);
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, value]) => ({
        name, value,
        color: CATEGORY_COLORS[name] || '#94a3b8',
        icon: CATEGORY_ICONS[name] || '📦',
      }));
  }, [filtered, getAmt]);
  const expTotal = useMemo(() => expByCat.reduce((s, c) => s + c.value, 0), [expByCat]);

  // Stable donut data — same reference unless values actually change
  const expDonutData = useMemo(
    () => expByCat.map(c => ({ value: c.value, color: c.color })),
    [expByCat]
  );

  const walletDist = useMemo(() =>
    sortedWallets.map(w => ({
      name: w.name,
      color: w.color || '#22c55e',
      value: convertToPreferred(typeof w.balance === 'number' ? w.balance : 0, w.currency || preferredCurrency, preferredCurrency),
      logo: w.logo || null,
      type: w.type,
    })),
    [sortedWallets, preferredCurrency]
  );

  const walletPositive = useMemo(() => walletDist.filter(w => w.value > 0), [walletDist]);
  const walletAssets = useMemo(() => walletPositive.reduce((s, w) => s + w.value, 0), [walletPositive]);
  const walletNetBalance = useMemo(() => walletDist.reduce((s, w) => s + w.value, 0), [walletDist]);

  // Stable donut data for wallets
  const walletDonutData = useMemo(
    () => walletPositive.map(w => ({ value: w.value, color: w.color })),
    [walletPositive]
  );

  const STATS = [
    { label: 'Income', value: fmtPreferred(periodIncome, preferredCurrency), color: '#10b981' },
    { label: 'Expenses', value: fmtPreferred(periodExpenses, preferredCurrency), color: '#f43f5e' },
    { label: 'Net Flow', value: fmtPreferred(netFlow, preferredCurrency), color: netFlow >= 0 ? '#10b981' : '#f43f5e' },
    { label: 'Savings Rate', value: `${savingsRate}%`, color: '#6366f1' },
  ];

  // ── helpers to split any array into rows of 2 ──────────────
  function chunkTwo<T>(arr: T[]): T[][] {
    const rows: T[][] = [];
    for (let i = 0; i < arr.length; i += 2) rows.push(arr.slice(i, i + 2));
    return rows;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <AnimCard delay={0} triggerKey={triggerKey}>
          <View style={s.header}>
            <View>
              <Text style={s.headerSub}>OVERVIEW</Text>
              <Text style={s.pageTitle}>Analytics</Text>
            </View>
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveBadgeText}>Live</Text>
            </View>
          </View>
        </AnimCard>

        {/* Period filter */}
        <AnimCard delay={60} triggerKey={triggerKey}>
          <View style={s.periodRow}>
            {PERIODS.map(p => {
              const active = p.key === period;
              return (
                <Pressable key={p.key} style={[s.periodPill, active && s.periodPillActive]}
                  onPress={() => { setPeriod(p.key); setTriggerKey(k => k + 1); }}>
                  <Text style={[s.periodText, active && s.periodTextActive]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </AnimCard>

        {/* Stats 2×2 */}
        <View style={s.statsGrid}>
          {STATS.map((st, i) => (
            <StatCard key={st.label} label={st.label} value={st.value}
              color={st.color} delay={120 + i * 65} triggerKey={triggerKey} />
          ))}
        </View>

        {/* Line Chart */}
        <AnimCard delay={400} triggerKey={triggerKey}>
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>
                {period === 'today' ? "Today's Flow" : period === 'weekly' ? 'This Week' : period === 'monthly' ? 'This Month' : 'This Year'}
              </Text>
              <View style={s.legend}>
                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#10b981' }]} /><Text style={s.legendText}>Income</Text></View>
                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#f43f5e' }]} /><Text style={s.legendText}>Expenses</Text></View>
              </View>
            </View>
            <AnimatedLineChart
              incomeData={chartData.income}
              expenseData={chartData.expenses}
              labels={chartData.labels}
              triggerKey={triggerKey}
            />
          </View>
        </AnimCard>

        {/* Expense Categories */}
        <AnimCard delay={520} triggerKey={triggerKey}>
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Expense Categories</Text>
              <Text style={s.cardSub}>{expByCat.length} categories</Text>
            </View>
            {expByCat.length === 0 ? (
              <Text style={s.emptyText}>No expenses in this period</Text>
            ) : (
              <>
                <View style={s.donutRow}>
                  <View style={s.donutRow}>
                    <AnimatedDonut
                      data={expDonutData}
                      total={expTotal}
                      centerLabel="TOTAL"
                      centerValue={fmtPreferred(expTotal, preferredCurrency)}
                      size={210}
                      triggerKey={triggerKey}
                    />
                  </View>
                </View>

                {/* ── 2-column grid: tiles with flex:1 inside explicit row views ── */}
                <View style={s.tileGrid}>
                  {chunkTwo(expByCat).map((pair, ri) => (
                    <View key={ri} style={s.tileRow}>
                      {pair.map(c => {
                        const pct = expTotal > 0 ? Math.round((c.value / expTotal) * 100) : 0;
                        return (
                          <View key={c.name} style={[s.tile, { borderLeftColor: c.color }]}>
                            <View style={[s.tileIcon, { backgroundColor: c.color + '22' }]}>
                              <Text style={s.tileEmoji}>{c.icon}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={s.tileName} numberOfLines={1}>{c.name}</Text>
                              <Text style={s.tileVal}>{fmtPreferred(c.value, preferredCurrency)}</Text>
                            </View>
                            <Text style={[s.tilePct, { color: c.color }]}>{pct}%</Text>
                          </View>
                        );
                      })}
                      {/* pad row if odd item */}
                      {pair.length === 1 && <View style={s.tileSpacer} />}
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </AnimCard>

        {/* Wallet Distribution */}
        <AnimCard delay={640} triggerKey={triggerKey}>
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Wallet Distribution</Text>
              <Text style={s.cardSub}>{walletDist.length} wallets</Text>
            </View>

            {walletPositive.length > 0 ? (
              <>
                <View style={s.donutRow}>
                  <AnimatedDonut
                    data={walletDonutData}
                    total={walletAssets}
                    centerLabel="TOTAL"
                    centerValue={fmtPreferred(walletNetBalance, preferredCurrency)}
                    size={210}
                    triggerKey={triggerKey}
                  />
                </View>



                {/* ── 2-column grid ── */}
                <View style={s.tileGrid}>
                  {chunkTwo(walletDist).map((pair, ri) => (
                    <View key={ri} style={s.tileRow}>
                      {pair.map(w => {
                        const pct = walletAssets > 0 ? Math.round((Math.max(w.value, 0) / walletAssets) * 100) : 0;
                        const isNeg = w.value < 0;
                        const dc = isNeg ? '#f43f5e' : w.color;
                        return (
                          <View key={w.name} style={[s.tile, { borderLeftColor: dc }]}>
                            <View style={[s.tileIcon, { backgroundColor: dc + '22' }]}>
                              {w.logo
                                ? <Image source={{ uri: w.logo }} style={s.tileLogo} />
                                : <Text style={s.tileEmoji}>{WALLET_EMOJI[w.type] || '💰'}</Text>
                              }
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={s.tileName} numberOfLines={1}>{w.name}</Text>
                              <Text style={[s.tileVal, isNeg && { color: '#f43f5e' }]}>
                                {fmtPreferred(w.value, preferredCurrency)}
                              </Text>
                            </View>
                            <Text style={[s.tilePct, { color: dc }]}>
                              {isNeg ? '–' : `${pct}%`}
                            </Text>
                          </View>
                        );
                      })}
                      {pair.length === 1 && <View style={s.tileSpacer} />}
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={s.emptyText}>No wallet data</Text>
            )}
          </View>
        </AnimCard>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 16, paddingBottom: 20 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 14, marginBottom: 14 },
  headerSub: { color: COLORS.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  pageTitle: { color: COLORS.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.8 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(16,185,129,0.16)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  liveBadgeText: { color: '#10b981', fontSize: 11, fontWeight: '700' },

  periodRow: {
    flexDirection: 'row', gap: 8, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 14,
  },
  periodPill: { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  periodPillActive: {
    backgroundColor: 'rgba(16,185,129,0.7)',
    shadowColor: '#10b981', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
  },
  periodText: { color: COLORS.textFaint, fontSize: 12.5, fontWeight: '600' },
  periodTextActive: { color: '#ffffff', fontWeight: '800' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCardShadow: {
    width: (SW - 32 - 10) / 2,
    borderRadius: 16,
    backgroundColor: COLORS.cardElevated,
    ...SHADOW.card,
  },
  statCard: {
    borderRadius: 16, padding: 16, overflow: 'hidden',
  },
  statAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  statLabel: { color: COLORS.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 9, marginTop: 5 },
  statValue: { fontWeight: '800', fontSize: 18, letterSpacing: -0.5 },

  card: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: 20, padding: CARD_PAD, marginBottom: 14,
    ...SHADOW.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  cardSub: { color: COLORS.textFaint, fontSize: 11, fontWeight: '600' },
  emptyText: { color: COLORS.textFaint, fontSize: 13, textAlign: 'center', paddingVertical: 24 },

  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.textFaint, fontSize: 11, fontWeight: '600' },

  donutRow: { alignItems: 'center', marginBottom: 14 },

  // ── 2-column tile grid ──────────────────────────────────
  tileGrid: {
    gap: 8,
  },

  tileRow: {
    flexDirection: 'row',
    gap: 8,
  },

  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 8,
    borderLeftWidth: 2,
  },

  tileSpacer: {
    flex: 1,
  },

  tileIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },

  tileEmoji: {
    fontSize: 10,
  },

  tileLogo: {
    width: 20,
    height: 20,
    borderRadius: 8,
  },

  tileName: {
    color: COLORS.textSlate,
    fontSize: 10,
    fontWeight: '700',
  },

  tileVal: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },

  tilePct: {
    fontWeight: '900',
    fontSize: 13,
    flexShrink: 0,
  },
  // ────────────────────────────────────────────────────────
});