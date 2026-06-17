// app/(tabs)/wallets.tsx — Debt & Lending (Financial Profiles) Home Screen
// NOTE: This replaces the wallets tab or can be placed as a new debt-lending tab.
// Based on the existing tab structure, this file should be placed at the correct route.
// The existing wallets.tsx remains; this file is the NEW debt-lending home screen.

// app/debt-lending/index.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Dimensions, Image, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useProfilesStore } from '@/store/useProfilesStore';
import { useProfiles } from '@/hooks/useProfiles';
import { useAppStore } from '@/store/useAppStore';
import { FinancialProfile, ProfileFilterType, ProfileStatus } from '@/types/profiles';
import { COLORS, RADIUS, SPACING, FONT, SHADOW } from '@/constants/theme';
import { fmtCurrency, convertToPreferred } from '@/lib/currency';

const { width: SW } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProfileStatus(profile: FinancialProfile): ProfileStatus {
  if (profile.currentBalance > 0.009) return 'you_owe';
  if (profile.currentBalance < -0.009) return 'owes_you';
  return 'settled';
}

const PROFILE_TYPE_ICONS: Record<string, string> = {
  friend: 'people', family: 'home', person: 'person',
  bank: 'business', company: 'briefcase', business: 'storefront', other: 'ellipsis-horizontal',
};

const PROFILE_TYPE_LABELS: Record<string, string> = {
  friend: 'Friend', family: 'Family', person: 'Person',
  bank: 'Bank', company: 'Company', business: 'Business', other: 'Other',
};

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────
const FILTERS: { key: ProfileFilterType; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'you_owe',   label: 'You Owe' },
  { key: 'owes_you',  label: 'Owes You' },
  { key: 'settled',   label: 'Settled' },
  { key: 'bank',      label: 'Banks' },
  { key: 'business',  label: 'Business' },
];

// ─── Summary Bar ──────────────────────────────────────────────────────────────
function SummaryBar({ profiles }: { profiles: FinancialProfile[] }) {
  const { preferredCurrency } = useAppStore();

  const totalOwed = profiles
    .filter(p => p.currentBalance > 0)
    .reduce((s, p) => s + p.currentBalance, 0);

  const totalReceivable = profiles
    .filter(p => p.currentBalance < 0)
    .reduce((s, p) => s + Math.abs(p.currentBalance), 0);

  return (
    <View style={styles.summaryBar}>
      {/* You Owe → Orange */}
      <LinearGradient
        colors={['rgba(249,115,22,0.15)', 'rgba(249,115,22,0.05)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.summaryCard}
      >
        <View style={[styles.summaryDot, { backgroundColor: '#f97316' }]} />
        <Text style={styles.summaryLabel}>You Owe</Text>
        <Text style={[styles.summaryAmount, { color: '#f97316' }]}>
          {fmtCurrency(convertToPreferred(totalOwed, 'BDT', preferredCurrency), preferredCurrency)}
        </Text>
      </LinearGradient>

      {/* Receivable → Blue */}
      <LinearGradient
        colors={['rgba(59,130,246,0.15)', 'rgba(59,130,246,0.05)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.summaryCard}
      >
        <View style={[styles.summaryDot, { backgroundColor: '#3b82f6' }]} />
        <Text style={styles.summaryLabel}>Receivable</Text>
        <Text style={[styles.summaryAmount, { color: '#3b82f6' }]}>
          {fmtCurrency(convertToPreferred(totalReceivable, 'BDT', preferredCurrency), preferredCurrency)}
        </Text>
      </LinearGradient>
    </View>
  );
}

// ─── Profile Card ─────────────────────────────────────────────────────────────
function ProfileCard({ profile, onPress }: { profile: FinancialProfile; onPress: () => void }) {
  const { preferredCurrency } = useAppStore();
  const status = getProfileStatus(profile);
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 20 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  const accentColor = status === 'you_owe' ? '#f97316' : status === 'owes_you' ? '#3b82f6' : '#64748b';
  const bgFrom = status === 'you_owe'
    ? 'rgba(249,115,22,0.08)'
    : status === 'owes_you'
      ? 'rgba(59,130,246,0.08)'
      : 'rgba(100,116,139,0.05)';

  const balanceLabel = status === 'you_owe'
    ? 'You Owe'
    : status === 'owes_you'
      ? 'Owes You'
      : 'Settled';

  const displayBalance = Math.abs(profile.currentBalance);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <View style={styles.cardOuterShadow}>
          <View style={styles.cardOuter}>
            {/* Accent stripe */}
            <View style={[styles.cardAccentStripe, { backgroundColor: accentColor }]} />
            {/* Glow */}
            <View style={[styles.cardGlow, { backgroundColor: accentColor + '12' }]} />

          <View style={styles.cardContent}>
            {/* Avatar */}
            <View style={[styles.avatar, { borderColor: accentColor + '44' }]}>
              {profile.profilePic ? (
                <Image source={{ uri: profile.profilePic }} style={styles.avatarImg} />
              ) : (
                <LinearGradient
                  colors={[accentColor + '33', accentColor + '11']}
                  style={styles.avatarGradient}
                >
                  <Text style={[styles.avatarInitials, { color: accentColor }]}>
                    {getInitials(profile.name)}
                  </Text>
                </LinearGradient>
              )}
            </View>

            {/* Info */}
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>{profile.name}</Text>
              <View style={styles.cardTypeBadge}>
                <Ionicons
                  name={PROFILE_TYPE_ICONS[profile.type] as any || 'person'}
                  size={10}
                  color={COLORS.textMuted}
                />
                <Text style={styles.cardTypeText}>{PROFILE_TYPE_LABELS[profile.type]}</Text>
              </View>
            </View>

            {/* Balance */}
            <View style={styles.cardBalance}>
              <Text style={[styles.balanceLabel, { color: accentColor + 'cc' }]}>{balanceLabel}</Text>
              <Text style={[styles.balanceAmount, { color: accentColor }]}>
                {status === 'settled' ? '—' : fmtCurrency(convertToPreferred(displayBalance, 'BDT', preferredCurrency), preferredCurrency)}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color={COLORS.textFaint} />
          </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="people" size={32} color={COLORS.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>No Financial Profiles</Text>
      <Text style={styles.emptySubtitle}>
        Track money you owe or are owed by{'\n'}people, banks, and businesses.
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onAdd}>
        <LinearGradient colors={['#3b82f6', '#1d4ed8']} style={styles.emptyBtnGrad}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.emptyBtnText}>Add First Profile</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DebtLendingScreen() {
  const router = useRouter();
  const { profiles } = useProfilesStore();
  const { hydrateProfiles } = useProfiles();
  const [filter, setFilter] = useState<ProfileFilterType>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const headerOpacity = useRef(new Animated.Value(0)).current;

  useFocusEffect(useCallback(() => {
    hydrateProfiles();
    Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await hydrateProfiles();
    setRefreshing(false);
  };

  const filtered = profiles.filter(p => {
    const status = getProfileStatus(p);
    if (filter === 'you_owe'  && status !== 'you_owe')  return false;
    if (filter === 'owes_you' && status !== 'owes_you') return false;
    if (filter === 'settled'  && status !== 'settled')  return false;
    if (filter === 'bank'     && p.type !== 'bank')     return false;
    if (filter === 'business' && !['business','company'].includes(p.type)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!p.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Background */}
      <LinearGradient colors={['#030712', '#060d1a', '#030712']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <View>
          <Text style={styles.headerTitle}>Debt & Lending</Text>
          <Text style={styles.headerSub}>{profiles.length} profile{profiles.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/debt-lending/create-profile')}
        >
          <LinearGradient colors={['#3b82f6', '#1d4ed8']} style={styles.addBtnGrad}>
            <Ionicons name="add" size={22} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Summary */}
      {profiles.length > 0 && <SummaryBar profiles={profiles} />}

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search profiles…"
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            {filter === f.key && (
              <LinearGradient
                colors={['#3b82f622', '#3b82f611']}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Profile List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {profiles.length === 0 ? (
          <EmptyState onAdd={() => router.push('/debt-lending/create-profile')} />
        ) : filtered.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>No profiles match your filter</Text>
          </View>
        ) : (
          filtered.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              onPress={() => router.push({ pathname: '/debt-lending/profile-detail', params: { profileId: p.id } })}
            />
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#030712' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.sm,
  },
  headerTitle: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700', letterSpacing: -0.5 },
  headerSub: { color: COLORS.textMuted, fontSize: FONT.sm, marginTop: 2 },
  addBtn: { borderRadius: RADIUS.full, overflow: 'hidden' },
  addBtnGrad: { width: 44, height: 44, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },

  summaryBar: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm,
  },
  summaryCard: {
    flex: 1, borderRadius: RADIUS.md, padding: SPACING.md,
    position: 'relative',
    ...SHADOW.raised,
  },
  summaryDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#3b82f6',
    marginBottom: 4,
  },
  summaryLabel: { color: COLORS.textMuted, fontSize: FONT.xs, marginBottom: 2 },
  summaryAmount: { fontSize: FONT.md, fontWeight: '700' },

  searchRow: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: FONT.body },

  filterScroll: { flexGrow: 0, marginBottom: SPACING.sm },
  filterContent: { paddingHorizontal: SPACING.lg, gap: SPACING.xs },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden',
  },
  filterTabActive: {},
  filterLabel: { color: COLORS.textMuted, fontSize: FONT.sm },
  filterLabelActive: { color: '#3b82f6', fontWeight: '600' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },

  // Card
  cardOuterShadow: {
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    ...SHADOW.row,
  },
  cardOuter: {
    borderRadius: RADIUS.lg, overflow: 'hidden',
  },
  cardAccentStripe: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
  },
  cardGlow: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%',
  },
  cardContent: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 1.5, overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: FONT.md, fontWeight: '700' },
  cardInfo: { flex: 1 },
  cardName: { color: COLORS.text, fontSize: FONT.body, fontWeight: '600', marginBottom: 3 },
  cardTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardTypeText: { color: COLORS.textMuted, fontSize: FONT.xs },
  cardBalance: { alignItems: 'flex-end' },
  balanceLabel: { fontSize: FONT.xs, marginBottom: 2 },
  balanceAmount: { fontSize: FONT.md, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: SPACING.xl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
  },
  emptyTitle: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700', marginBottom: SPACING.xs, textAlign: 'center' },
  emptySubtitle: { color: COLORS.textMuted, fontSize: FONT.body, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.lg },
  emptyBtn: { borderRadius: RADIUS.full, overflow: 'hidden' },
  emptyBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: 12, paddingHorizontal: SPACING.lg },
  emptyBtnText: { color: '#fff', fontSize: FONT.body, fontWeight: '700' },

  noResults: { alignItems: 'center', paddingTop: 60 },
  noResultsText: { color: COLORS.textMuted, fontSize: FONT.body },
});