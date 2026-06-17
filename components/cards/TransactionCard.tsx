// components/cards/TransactionCard.tsx — shared transaction row
//
// Used by the Transactions tab and the Home tab's "Recent Transactions"
// section so both stay visually and behaviourally identical.
//
// If a Debt/Lent transaction was mirrored from a Financial Profile that has
// since been deleted, the row renders dimmed with a centered red
// "Profile deleted" badge (the row stays tappable so the user can still view
// or clean up the orphaned record).

import React from 'react';
import { View, Text, StyleSheet, Image, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Transaction, Wallet } from '@/types';
import { CATEGORY_ICONS, CATEGORY_COLORS, TX_TYPE_COLOR, NEON_BLUE } from '@/constants/data';
import { fmtCurrency } from '@/lib/currency';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';
import { PressRow } from '@/components/ui/PressRow';
import { ProfileDeletedBadge } from '@/components/ui/ProfileDeletedBadge';
import { useProfilesStore } from '@/store/useProfilesStore';
import { fmtTxTime, getLinkedProfileId } from '@/lib/txFormat';

interface Props {
  tx: Transaction;
  wallets: Wallet[];
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function TransactionCard({ tx, wallets, onPress, style }: Props) {
  const profiles = useProfilesStore(s => s.profiles);

  const isTransfer  = tx.type === 'transfer';
  const wallet      = wallets.find((w) => w.id === tx.walletId);
  const currency    = wallet?.currency || 'BDT';
  const typeColor   = TX_TYPE_COLOR[tx.type] || COLORS.textMuted;
  const isPos       = tx.type === 'income' || tx.type === 'debt';
  const showPfp     = (tx.type === 'debt' || tx.type === 'lent') && tx.profilePic;
  const timeStr     = fmtTxTime(tx.createdAt, tx.date);

  // ── Profile-deleted detection ───────────────────────────────────────────
  const linkedProfileId  = getLinkedProfileId(tx);
  const isProfileDeleted = !!linkedProfileId && !profiles.some(p => p.id === linkedProfileId);

  // ── Transfer-specific display ───────────────────────────────────────────
  const fromWallet = isTransfer ? wallets.find(w => w.id === tx.fromWalletId) : null;
  const toWallet   = isTransfer ? wallets.find(w => w.id === tx.toWalletId)   : null;
  const icon       = isTransfer
    ? '⇄'
    : CATEGORY_ICONS[tx.category || ''] || (tx.type === 'lent' ? '🤝' : tx.type === 'debt' ? '💸' : '📦');
  const iconBg = CATEGORY_COLORS[tx.category || ''] || typeColor;
  const displayTitle = isTransfer
    ? `${fromWallet?.name || '—'} → ${toWallet?.name || '—'}`
    : tx.title;
  const displayMeta  = isTransfer
    ? `Transfer${timeStr ? `  ·  ${timeStr}` : ''}`
    : `${wallet ? wallet.name : ''}${timeStr ? `  ·  ${timeStr}` : ''}`;

  return (
    <PressRow onPress={onPress} style={style}>
      <View style={styles.txRow}>
        <View style={styles.txRowInner}>
          <View style={[styles.txRowContent, isProfileDeleted && styles.txRowContentDisabled]}>
            {showPfp ? (
              <View style={styles.pfpWrap}>
                <Image source={{ uri: tx.profilePic! }} style={[styles.pfpImg, { borderColor: typeColor + '50' }]} />
                <View style={[styles.pfpBadge, { backgroundColor: typeColor }]}>
                  <Text style={{ fontSize: 8 }}>{tx.type === 'lent' ? '🤝' : '💸'}</Text>
                </View>
              </View>
            ) : (
              <View style={[
                styles.txIcon,
                isTransfer
                  ? { backgroundColor: NEON_BLUE + '24' }
                  : { backgroundColor: iconBg + '20' },
              ]}>
                <Text style={[styles.txIconText, isTransfer && { color: NEON_BLUE }]}>{icon}</Text>
              </View>
            )}

            <View style={styles.txInfo}>
              <View style={styles.txTitleRow}>
                <Text numberOfLines={1} style={styles.txTitle}>{displayTitle}</Text>
                {(tx.type === 'debt' || tx.type === 'lent' || isTransfer) && (
                  <View style={[styles.typeBadge, { backgroundColor: typeColor + '20' }]}>
                    <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                      {isTransfer ? 'TRANSFER' : tx.type.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.txMeta} numberOfLines={1}>{displayMeta}</Text>
            </View>

            <Text style={[styles.txAmount, { color: typeColor }]}>
              {isTransfer ? '' : (isPos ? '+' : '-')}{fmtCurrency(tx.amount, currency)}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.textFaint} />
          </View>

          {isProfileDeleted && <ProfileDeletedBadge />}
        </View>
      </View>
    </PressRow>
  );
}

const styles = StyleSheet.create({
  // Outer layer casts the shadow (must not clip, or the shadow disappears on iOS)
  txRow: {
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    ...SHADOW.row,
  },
  // Inner layer clips content to the rounded shape (ProfileDeletedBadge overlay contract)
  txRowInner: {
    position: 'relative', overflow: 'hidden',
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    padding: 12,
  },
  txRowContent:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  txRowContentDisabled: { opacity: 0.35 },

  pfpWrap:       { position: 'relative', flexShrink: 0 },
  pfpImg:        { width: 40, height: 40, borderRadius: 20, borderWidth: 2 },
  pfpBadge:      { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.card },
  txIcon:        { width: 40, height: 40, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txIconText:    { fontSize: 18 },
  txInfo:        { flex: 1, minWidth: 0 },
  txTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  txTitle:       { color: COLORS.textSecondary, fontWeight: '600', fontSize: 13, flex: 1 },
  typeBadge:     { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  typeBadgeText: { fontSize: 9, fontWeight: '700' },
  txMeta:        { color: COLORS.textFaint, fontSize: 11 },
  txAmount:      { fontWeight: '700', fontSize: 13, flexShrink: 0 },
});
