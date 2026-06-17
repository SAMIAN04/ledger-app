'ENDOFFILE'
// components/dashboard/WalletStrip.tsx
// Elite fintech wallet strip — no blur dependency.
// Glass effect achieved via layered LinearGradient + border opacity + glow orbs.
// Technique used by Revolut, Linear, Vercel mobile — GPU-friendly on Android.

import React, { useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, Animated, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Circle } from 'react-native-svg';
import { useAppStore } from '@/store/useAppStore';
import { sortWallets } from '@/utils/walletSort';
import { fmtCurrency } from '@/lib/currency';
import { WALLET_EMOJI } from '@/constants/data';
import { COLORS, SHADOW } from '@/constants/theme';
import { useRouter } from 'expo-router';

// ─── Sparkline ────────────────────────────────────────────────────────────────
const SW = 140; const SH = 40;

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * SW,
      y: SH - ((v - min) / range) * (SH * 0.75) - SH * 0.12,
    }));
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]; const c = pts[i];
      const cpx = (p.x + c.x) / 2;
      d += ` C ${cpx.toFixed(1)} ${p.y.toFixed(1)}, ${cpx.toFixed(1)} ${c.y.toFixed(1)}, ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
    }
    const last = pts[pts.length - 1]; const first = pts[0];
    return {
      line: d,
      fill: d + ` L ${last.x.toFixed(1)} ${SH} L ${first.x.toFixed(1)} ${SH} Z`,
      dot: last,
    };
  }, [data]);

  if (!path) return null;
  const gid = `g${color.replace(/[^a-z0-9]/gi, '')}`;
  const sid = `s${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <Svg width={SW} height={SH}>
      <Defs>
        {/* fill gradient */}
        <SvgGrad id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.28" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGrad>
        {/* dot glow */}
        <SvgGrad id={sid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="1" />
          <Stop offset="1" stopColor={color} stopOpacity="0.4" />
        </SvgGrad>
      </Defs>
      <Path d={path.fill} fill={`url(#${gid})`} />
      <Path d={path.line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {/* Endpoint glow dot */}
      <Circle cx={path.dot.x} cy={path.dot.y} r={5} fill={color} opacity={0.18} />
      <Circle cx={path.dot.x} cy={path.dot.y} r={2.5} fill={`url(#${sid})`} />
    </Svg>
  );
}

// ─── Glow Orb ─────────────────────────────────────────────────────────────────
// Layered concentric circles — creates a real soft glow without any blur API.
// Outer ring very faint, core bright. GPU cost: near zero.
function GlowOrb({ color, size = 100 }: { color: string; size?: number }) {
  return (
    <>
      <View style={{
        position: 'absolute', width: size, height: size,
        borderRadius: size / 2, backgroundColor: color + '09',
      }} />
      <View style={{
        position: 'absolute',
        width: size * 0.62, height: size * 0.62,
        borderRadius: size / 2, backgroundColor: color + '16',
      }} />
      <View style={{
        position: 'absolute',
        width: size * 0.32, height: size * 0.32,
        borderRadius: size / 2, backgroundColor: color + '32',
      }} />
    </>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
// Solid elevated surface + a subtle per-wallet color wash at the top.
// No translucency / blur — renders identically on Android and iOS.
function GlassCard({
  children, style, accentColor,
}: { children: React.ReactNode; style?: any; accentColor: string }) {
  return (
    <View style={[styles.cardOuter, style]}>
      {/* Solid base surface */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.cardElevated }]} />
      {/* Top accent wash — tints the card with the wallet's color */}
      <LinearGradient
        colors={[accentColor + '1C', 'transparent']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

// ─── Pressable Chip ───────────────────────────────────────────────────────────
function PressChip({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, damping: 18, stiffness: 380 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220 }).start()
        }
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Wallet Chip ──────────────────────────────────────────────────────────────
function WalletChip({ w, onPress }: { w: any; onPress: () => void }) {
  const color = w.color || '#10b981';
  const isNeg = (w.balance || 0) < 0;
  const displayColor = isNeg ? '#ef4444' : color;
  const isUp = w.spark?.length >= 2 && w.spark[w.spark.length - 1] >= w.spark[0];

  return (
    <PressChip onPress={onPress}>
      <GlassCard accentColor={displayColor}>
        {/* Glow orb top-right */}
        <View style={{ position: 'absolute', top: -30, right: -30, alignItems: 'center', justifyContent: 'center' }}>
          <GlowOrb color={displayColor} size={100} />
        </View>

        {/* Top accent line */}
        <LinearGradient
          colors={[displayColor, displayColor + '00']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.accentLine}
        />

        <View style={styles.chipContent}>
          {/* Header row */}
          <View style={styles.chipHeader}>
            <View style={[styles.iconWrap, { backgroundColor: displayColor + '20' }]}>
              {w.logo
                ? <Image source={{ uri: w.logo }} style={styles.chipLogo} />
                : <Text style={styles.chipEmoji}>{WALLET_EMOJI[w.type] || '💼'}</Text>
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chipName} numberOfLines={1}>{w.name}</Text>
              <View style={styles.typeRow}>
                <View style={[styles.typeDot, { backgroundColor: displayColor }]} />
                <Text style={styles.chipType}>{w.type}</Text>
              </View>
            </View>
            {/* Trend arrow */}
            <View style={[styles.trendBadge, { backgroundColor: (isUp ? '#10b981' : '#ef4444') + '18' }]}>
              <Text style={[styles.trendArrow, { color: isUp ? '#10b981' : '#ef4444' }]}>
                {isUp ? '↑' : '↓'}
              </Text>
            </View>
          </View>

          {/* Balance */}
          <Text style={[styles.chipBalance, { color: displayColor }]} numberOfLines={1} adjustsFontSizeToFit>
            {fmtCurrency(w.balance || 0, w.currency || 'BDT')}
          </Text>
          <Text style={styles.chipCurrency}>{w.currency || 'BDT'}</Text>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: displayColor + '18' }]} />

          {/* Sparkline */}
          <View style={styles.sparkWrap}>
            <Sparkline data={w.spark} color={displayColor} />
          </View>
        </View>
      </GlassCard>
    </PressChip>
  );
}

// ─── Add Wallet Chip ──────────────────────────────────────────────────────────
function AddWalletChip({ onPress }: { onPress: () => void }) {
  return (
    <PressChip onPress={onPress}>
      <GlassCard style={styles.addCard} accentColor="#10b981">
        <View style={styles.addInner}>
          {/* Soft center glow */}
          <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
            <GlowOrb color="#10b981" size={90} />
          </View>
          {/* Plus icon ring */}
          <View style={styles.addRing}>
            <LinearGradient
              colors={['#10b981', '#047857']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.addRingGrad}
            >
              <Text style={styles.addPlus}>+</Text>
            </LinearGradient>
          </View>
          <Text style={styles.addLabel}>New Wallet</Text>
          <Text style={styles.addSub}>Tap to create</Text>
        </View>
      </GlassCard>
    </PressChip>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WalletStrip() {
  const { wallets: rawWallets, transactions } = useAppStore();
  const router = useRouter();
  const sortedWallets = useMemo(() => sortWallets(rawWallets), [rawWallets]);

  const walletData = useMemo(() => sortedWallets.map(w => {
    // Include transfers in sparkline (they represent real balance movements)
    const wTxs = transactions.filter(t => t.walletId === w.id || t.toWalletId === w.id).slice(0, 8);
    const spark = wTxs.length >= 2
      ? wTxs.map(t => t.amount || 0).reverse()
      : [0, w.balance || 0];
    return { ...w, spark };
  }), [sortedWallets, transactions]);

  return (
    <View style={styles.outer}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerDot} />
          <Text style={styles.headerLabel}>Wallets</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{sortedWallets.length}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/wallets' as any)}
          style={styles.viewAllBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>View all</Text>
          <Text style={styles.viewAllArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={184}
        snapToAlignment="start"
      >
        {walletData.map((w) => (
          <WalletChip
            key={w.id}
            w={w}
            onPress={() => router.push({ pathname: '/modals/wallet-detail', params: { walletId: w.id } } as any)}
          />
        ))}
        <AddWalletChip onPress={() => router.push('/modals/add-wallet' as any)} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CHIP_W = 172;

const styles = StyleSheet.create({
  outer: { marginBottom: 24 },

  // Header
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  headerLabel: { color: COLORS.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  countBadge:  { backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  countText:   { color: COLORS.primary, fontSize: 10, fontWeight: '700' },
  viewAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  viewAllText: { color: COLORS.textSlate, fontSize: 12, fontWeight: '600' },
  viewAllArrow:{ color: COLORS.primary, fontSize: 14, fontWeight: '700', marginTop: -1 },

  // Scroll
  scrollContent: { paddingLeft: 20, paddingRight: 20, gap: 12 },

  // Card base
  cardOuter: {
    width: CHIP_W, borderRadius: 22, overflow: 'hidden',
    ...SHADOW.card,
  },

  // Wallet chip internals
  accentLine:  { position: 'absolute', top: 0, left: 0, right: 0, height: 0 },
  chipContent: { padding: 14 },
  chipHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  iconWrap:    { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipLogo:    { width: 28, height: 28, borderRadius: 6 },
  chipEmoji:   { fontSize: 15 },
  chipName:    { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: -0.2 },
  typeRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  typeDot:     { width: 4, height: 4, borderRadius: 2 },
  chipType:    { color: COLORS.textFaint, fontSize: 9.5, textTransform: 'capitalize', fontWeight: '500' },
  trendBadge:  { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  trendArrow:  { fontSize: 12, fontWeight: '800' },
  chipBalance: { fontSize: 18, fontWeight: '900', letterSpacing: -0.8, marginBottom: 2 },
  chipCurrency:{ color: COLORS.textFaint, fontSize: 9.5, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  divider:     { height: 0, marginBottom: 10, borderRadius: 1 },
  sparkWrap:   { marginHorizontal: -2 },

  // Add wallet chip
  addCard:     { width: CHIP_W },
  addInner:    { alignItems: 'center', justifyContent: 'center', paddingVertical: 34, gap: 10 },
  addRing:     { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  addRingGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addPlus:     { color: '#fff', fontSize: 26, fontWeight: '200', lineHeight: 30, marginTop: -2 },
  addLabel:    { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  addSub:      { color: COLORS.textFaint, fontSize: 10, fontWeight: '500' },
});