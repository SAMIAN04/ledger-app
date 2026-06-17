// app/debt-lending/profile-detail.tsx — Full Financial Profile Detail Screen
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useProfilesStore } from '@/store/useProfilesStore';
import { useProfiles, reversalDelta, ProfileDeletionPreview } from '@/hooks/useProfiles';
import { useAppStore } from '@/store/useAppStore';
import { FinancialProfile, ProfileTransaction, ProfileTransactionType } from '@/types/profiles';
import { COLORS, RADIUS, SPACING, FONT, SHADOW } from '@/constants/theme';
import { fmtCurrency, convertToPreferred } from '@/lib/currency';
import { ConfirmDeleteSheet } from '@/components/ui/ConfirmDeleteSheet';

const { width: SW } = Dimensions.get('window');

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function getStatus(profile: FinancialProfile) {
  if (profile.currentBalance > 0.009) return 'you_owe';
  if (profile.currentBalance < -0.009) return 'owes_you';
  return 'settled';
}

const STATUS_CONFIG = {
  you_owe:  { label: 'You Owe',  color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  owes_you: { label: 'Owes You', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  settled:  { label: 'Settled',  color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
};

const TX_CONFIG: Record<ProfileTransactionType, { label: string; icon: string; color: string; sign: string }> = {
  borrow:     { label: 'Borrowed',       icon: 'arrow-down-circle',  color: '#f97316', sign: '+' },
  lend:       { label: 'Lent',           icon: 'arrow-up-circle',    color: '#3b82f6', sign: '-' },
  repay:      { label: 'Repaid',         icon: 'checkmark-circle',   color: '#ef4444', sign: '-' },
  receive:    { label: 'Received',       icon: 'arrow-down-circle',  color: '#10b981', sign: '+' },
  adjustment: { label: 'Adjustment',     icon: 'options',            color: '#f59e0b', sign: '±' },
  interest:   { label: 'Interest',       icon: 'trending-up',        color: '#f97316', sign: '+' },
  fee:        { label: 'Fee',            icon: 'receipt',            color: '#94a3b8', sign: '+' },
};

// ─── Summary Cards ────────────────────────────────────────────────────────────
function SummaryCard({ label, value, color, currency }: { label: string; value: number; color: string; currency: string }) {
  // value is stored in BDT; convert to preferredCurrency for display
  const display = convertToPreferred(value, 'BDT', currency);
  return (
    <View style={sumStyles.card}>
      <View style={[sumStyles.dot, { backgroundColor: color }]} />
      <Text style={sumStyles.label}>{label}</Text>
      <Text style={[sumStyles.value, { color }]}>{fmtCurrency(display, currency)}</Text>
    </View>
  );
}

const sumStyles = StyleSheet.create({
  card: {
    flex: 1, minWidth: (SW - 48 - 8) / 2,
    backgroundColor: COLORS.cardElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    ...SHADOW.row,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginBottom: 6 },
  label: { color: COLORS.textMuted, fontSize: FONT.xs, marginBottom: 4 },
  value: { fontSize: FONT.md, fontWeight: '700' },
});

// ─── Timeline Item ─────────────────────────────────────────────────────────────
function TimelineItem({
  tx, currency, wallets, onDelete,
}: { tx: ProfileTransaction; currency: string; wallets: any[]; onDelete: () => void }) {
  const cfg = TX_CONFIG[tx.type] || TX_CONFIG.adjustment;
  const dt = new Date(tx.createdAt || tx.date);
  // Convert tx amount from its wallet's currency to preferredCurrency
  const txWallet = wallets.find((w: any) => w.id === tx.walletId);
  const txCurrency = txWallet?.currency || 'BDT';
  const displayAmt = convertToPreferred(tx.amount, txCurrency, currency);

  return (
    <View style={tlStyles.row}>
      {/* Line */}
      <View style={tlStyles.lineCol}>
        <View style={[tlStyles.dot, { backgroundColor: cfg.color }]} />
        <View style={tlStyles.line} />
      </View>

      {/* Content */}
      <View style={tlStyles.content}>
        <View style={tlStyles.header}>
          <View style={tlStyles.iconBadge}>
            <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={tlStyles.typeLabel}>{cfg.label}</Text>
            {tx.walletName && (
              <Text style={tlStyles.walletLabel}>via {tx.walletName}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[tlStyles.amount, { color: cfg.color }]}>
              {cfg.sign}{fmtCurrency(displayAmt, currency)}
            </Text>
            <Text style={tlStyles.time}>
              {dt.toLocaleDateString('en', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <TouchableOpacity style={tlStyles.delBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={13} color={COLORS.textFaint} />
          </TouchableOpacity>
        </View>
        {tx.note ? <Text style={tlStyles.note}>{tx.note}</Text> : null}
      </View>
    </View>
  );
}

const tlStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm },
  lineCol: { alignItems: 'center', width: 20 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 14 },
  line: { flex: 1, width: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginTop: 4 },
  content: {
    flex: 1, backgroundColor: COLORS.cardElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm,
    ...SHADOW.row,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  iconBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  typeLabel: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '600' },
  walletLabel: { color: COLORS.textMuted, fontSize: FONT.xs },
  amount: { fontSize: FONT.sm, fontWeight: '700' },
  time: { color: COLORS.textFaint, fontSize: FONT.xs },
  delBtn: { padding: 4 },
  note: { color: COLORS.textSlate, fontSize: FONT.xs, marginTop: 6, lineHeight: 16 },
});

// ─── Add Transaction Sheet ────────────────────────────────────────────────────
// All possible types, used as the source of truth for filtering.
const ALL_TX_TYPES: { type: ProfileTransactionType; label: string; desc: string; color: string; icon: string; forOwesYou: boolean; forYouOwe: boolean }[] = [
  { type: 'lend',    label: 'Lend Money',      desc: 'You gave money',       color: '#3b82f6', icon: 'arrow-up-circle',   forOwesYou: true,  forYouOwe: false },
  { type: 'receive', label: 'Receive Payment',  desc: 'They paid you back',   color: '#10b981', icon: 'arrow-down-circle', forOwesYou: true,  forYouOwe: false },
  { type: 'borrow',  label: 'Borrow Money',     desc: 'You received money',   color: '#f97316', icon: 'arrow-down-circle', forOwesYou: false, forYouOwe: true  },
  { type: 'repay',   label: 'Repay Debt',       desc: 'You paid back money',  color: '#ef4444', icon: 'checkmark-circle',  forOwesYou: false, forYouOwe: true  },
  { type: 'adjustment', label: 'Adjustment',    desc: 'Manual correction',    color: '#f59e0b', icon: 'options',           forOwesYou: true,  forYouOwe: true  },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileId: string }>();
  const profileId = params.profileId;

  const { profiles } = useProfilesStore();
  const { getProfileTransactions, deleteProfileTransaction, deleteProfile, getProfileDeletionPreview } = useProfiles();
  const { preferredCurrency, wallets } = useAppStore();

  const profile = profiles.find(p => p.id === profileId);
  const [txs, setTxs] = useState<ProfileTransaction[]>([]);

  // Delete-profile confirm sheet
  const [deleteProfileVisible, setDeleteProfileVisible] = useState(false);
  const [deleteProfilePreview, setDeleteProfilePreview] = useState<ProfileDeletionPreview | null>(null);
  const [deletingProfile, setDeletingProfile] = useState(false);

  // Delete-transaction confirm sheet
  const [deleteTxTarget, setDeleteTxTarget] = useState<ProfileTransaction | null>(null);
  const [deletingTx, setDeletingTx] = useState(false);

  useFocusEffect(useCallback(() => {
    if (profileId) {
      getProfileTransactions(profileId).then(setTxs);
    }
  }, [profileId, profiles]));

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: COLORS.textMuted }}>Profile not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: COLORS.primary }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const status = getStatus(profile);
  const statusCfg = STATUS_CONFIG[status];
  const accentColor = statusCfg.color;

  function handleDeleteTx(tx: ProfileTransaction) {
    setDeleteTxTarget(tx);
  }

  async function confirmDeleteTx() {
    if (!deleteTxTarget) return;
    setDeletingTx(true);
    try {
      await deleteProfileTransaction(deleteTxTarget.id, profileId, deleteTxTarget);
      const updated = await getProfileTransactions(profileId);
      setTxs(updated);
      setDeleteTxTarget(null);
    } finally {
      setDeletingTx(false);
    }
  }

  async function handleDeleteProfile() {
    const preview = await getProfileDeletionPreview(profileId);
    setDeleteProfilePreview(preview);
    setDeleteProfileVisible(true);
  }

  async function confirmDeleteProfile() {
    setDeletingProfile(true);
    try {
      await deleteProfile(profileId);
      setDeleteProfileVisible(false);
      router.back();
    } finally {
      setDeletingProfile(false);
    }
  }

  const netOwed = Math.abs(profile.currentBalance);

  // ── Delete-profile confirm sheet content ──────────────────────────────────
  const profileRefundBullets = (deleteProfilePreview?.refunds || []).map(r => {
    const amt = fmtCurrency(Math.abs(r.delta), r.currency);
    return `${r.walletName} balance will ${r.delta > 0 ? 'increase' : 'decrease'} by ${amt}`;
  });
  const profileDeleteBullets = [
    ...profileRefundBullets,
    ...(deleteProfilePreview && deleteProfilePreview.txCount > 0
      ? [`${deleteProfilePreview.txCount} transaction${deleteProfilePreview.txCount === 1 ? '' : 's'} with ${profile.name} will be removed from this profile's history`]
      : []),
    `Past entries on the Transactions tab will stay but show as "Profile deleted"`,
    `"${profile.name}" cannot be recovered after this`,
  ];
  const profileDeleteSummary = deleteProfilePreview && deleteProfilePreview.refunds.length === 1
    ? (() => {
        const r = deleteProfilePreview.refunds[0];
        const amt = fmtCurrency(Math.abs(r.delta), r.currency);
        return `${amt} will be ${r.delta > 0 ? 'added back to' : 'taken from'} ${r.walletName} to settle the outstanding amount`;
      })()
    : deleteProfilePreview && deleteProfilePreview.refunds.length > 1
      ? 'Outstanding amounts will be merged back into the wallets involved'
      : undefined;

  // ── Delete-transaction confirm sheet content ──────────────────────────────
  const txCfg     = deleteTxTarget ? TX_CONFIG[deleteTxTarget.type] || TX_CONFIG.adjustment : null;
  const txWallet  = deleteTxTarget ? wallets.find(w => w.id === deleteTxTarget.walletId) : null;
  const txDelta   = deleteTxTarget ? reversalDelta(deleteTxTarget) : 0;
  const txDeleteSummary = (txWallet && txDelta !== 0)
    ? `${txWallet.name} balance will ${txDelta > 0 ? 'increase' : 'decrease'} by ${fmtCurrency(Math.abs(txDelta), txWallet.currency)}`
    : undefined;
  const txDeleteBullets = [
    `This "${txCfg?.label || 'transaction'}" entry will be removed from ${profile.name}'s history`,
    `The matching entry on the Transactions tab will also be removed`,
    `${profile.name}'s balance will be recalculated`,
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient colors={['#030712', '#060d1a', '#030712']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => router.push({ pathname: '/debt-lending/edit-profile', params: { profileId } })}
        >
          <Ionicons name="create-outline" size={20} color={COLORS.textSlate} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteProfile}>
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Card */}
        <View style={styles.heroShadow}>
          <View style={styles.hero}>
            <LinearGradient
              colors={[accentColor + '18', 'rgba(3,7,18,0.6)']}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Avatar */}
            <View style={[styles.avatar, { borderColor: accentColor + '55' }]}>
              {profile.profilePic ? (
                <Image source={{ uri: profile.profilePic }} style={styles.avatarImg} />
              ) : (
                <LinearGradient colors={[accentColor + '33', accentColor + '11']} style={styles.avatarGrad}>
                  <Text style={[styles.avatarText, { color: accentColor }]}>{getInitials(profile.name)}</Text>
                </LinearGradient>
              )}
            </View>
            <Text style={styles.heroName}>{profile.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.statusText, { color: accentColor }]}>{statusCfg.label}</Text>
            </View>
            {status !== 'settled' && (
              <Text style={[styles.heroBalance, { color: accentColor }]}>
                {fmtCurrency(convertToPreferred(netOwed, 'BDT', preferredCurrency), preferredCurrency)}
              </Text>
            )}
            {status === 'settled' && (
              <Text style={[styles.heroBalance, { color: '#64748b' }]}>All settled ✓</Text>
            )}
          </View>
        </View>

        {/* Summary Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Summary</Text>
          <View style={styles.summaryGrid}>
            <SummaryCard label="Total Borrowed"  value={profile.totalBorrowed}  color="#f97316" currency={preferredCurrency} />
            <SummaryCard label="Total Lent"      value={profile.totalLent}      color="#3b82f6" currency={preferredCurrency} />
            <SummaryCard label="Total Repaid"    value={profile.totalRepaid}    color="#ef4444" currency={preferredCurrency} />
            <SummaryCard label="Total Received"  value={profile.totalReceived}  color="#10b981" currency={preferredCurrency} />
          </View>
        </View>

        {/* Action Buttons — filtered by profile status */}
        <View style={styles.section}>
          <View style={styles.actionRow}>
            {ALL_TX_TYPES.filter(t => {
              if (status === 'settled')  return t.type === 'adjustment';
              if (status === 'owes_you') return t.forOwesYou;
              if (status === 'you_owe')  return t.forYouOwe;
              return true;
            }).map(t => (
              <TouchableOpacity
                key={t.type}
                style={[styles.actionBtn, { backgroundColor: t.color + '14' }]}
                onPress={() => router.push({
                  pathname: '/debt-lending/add-transaction',
                  params: { profileId, txType: t.type },
                })}
              >
                <LinearGradient
                  colors={[t.color + '22', t.color + '0a']}
                  style={styles.actionBtnGrad}
                >
                  <Ionicons name={t.icon as any} size={20} color={t.color} />
                  <Text style={[styles.actionLabel, { color: t.color }]} numberOfLines={1}>
                    {t.label}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Transaction History {txs.length > 0 ? `(${txs.length})` : ''}
          </Text>
          {txs.length === 0 ? (
            <View style={styles.emptyTimeline}>
              <Ionicons name="time-outline" size={28} color={COLORS.textFaint} />
              <Text style={styles.emptyTimelineText}>No transactions yet</Text>
              <Text style={styles.emptyTimelineSub}>Add a transaction above to get started</Text>
            </View>
          ) : (
            <View style={{ paddingLeft: 4 }}>
              {txs.map(tx => (
                <TimelineItem
                  key={tx.id}
                  tx={tx}
                  currency={preferredCurrency}
                  wallets={wallets}
                  onDelete={() => handleDeleteTx(tx)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Profile Info */}
        {(profile.phone || profile.email || profile.notes) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Info</Text>
            <View style={styles.infoCard}>
              {profile.phone && (
                <View style={styles.infoRow}>
                  <Ionicons name="call-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.infoText}>{profile.phone}</Text>
                </View>
              )}
              {profile.email && (
                <View style={styles.infoRow}>
                  <Ionicons name="mail-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.infoText}>{profile.email}</Text>
                </View>
              )}
              {profile.notes && (
                <View style={styles.infoRow}>
                  <Ionicons name="document-text-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.infoText}>{profile.notes}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <ConfirmDeleteSheet
        visible={deleteProfileVisible}
        onCancel={() => setDeleteProfileVisible(false)}
        onConfirm={confirmDeleteProfile}
        loading={deletingProfile}
        title={`Delete "${profile.name}"?`}
        actionSummary={profileDeleteSummary}
        detail="This permanently deletes the profile and its transaction timeline."
        bullets={profileDeleteBullets}
        confirmLabel="Delete Profile"
      />

      <ConfirmDeleteSheet
        visible={!!deleteTxTarget}
        onCancel={() => setDeleteTxTarget(null)}
        onConfirm={confirmDeleteTx}
        loading={deletingTx}
        title={`Delete this ${txCfg?.label || 'transaction'}?`}
        actionSummary={txDeleteSummary}
        detail="This reverses the wallet effect and removes the entry."
        bullets={txDeleteBullets}
        confirmLabel="Delete Entry"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#030712' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.xs,
  },
  editBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  heroShadow: {
    marginHorizontal: SPACING.lg, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.cardElevated,
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  hero: {
    alignItems: 'center', paddingVertical: SPACING.xl,
    borderRadius: RADIUS.xl, overflow: 'hidden',
  },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 2, overflow: 'hidden', marginBottom: SPACING.md,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700' },
  heroName: { color: COLORS.text, fontSize: FONT.xl, fontWeight: '700', marginBottom: SPACING.xs },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.full, marginBottom: SPACING.md,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: FONT.sm, fontWeight: '600' },
  heroBalance: { fontSize: FONT.xxl, fontWeight: '800', letterSpacing: -1 },

  section: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  sectionTitle: {
    color: COLORS.textSlate, fontSize: FONT.sm, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { minWidth: '30%', flex: 1, borderRadius: RADIUS.md, ...SHADOW.row },
  actionBtnGrad: {
    padding: SPACING.sm, alignItems: 'center', gap: 4,
    borderRadius: RADIUS.md, overflow: 'hidden',
  },
  actionLabel: { fontSize: FONT.xs, fontWeight: '600', textAlign: 'center' },

  emptyTimeline: { alignItems: 'center', paddingVertical: SPACING.xl },
  emptyTimelineText: { color: COLORS.textMuted, fontSize: FONT.body, marginTop: 8, fontWeight: '600' },
  emptyTimelineSub: { color: COLORS.textFaint, fontSize: FONT.xs, marginTop: 4 },

  infoCard: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md, gap: SPACING.sm,
    ...SHADOW.raised,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  infoText: { color: COLORS.textSecondary, fontSize: FONT.body, flex: 1 },
});