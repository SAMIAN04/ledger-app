// components/ui/TxDetailModal.tsx — Transfer-aware detail/delete sheet
import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable,
  TouchableOpacity, Animated, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowOrb } from '@/components/ui/GlassModal';
import { Ionicons } from '@expo/vector-icons';
import { fmtCurrency } from '@/lib/currency';
import { CATEGORY_ICONS, CATEGORY_COLORS, TX_TYPE_COLOR, NEON_BLUE } from '@/constants/data';
import { COLORS, SHADOW } from '@/constants/theme';
import { getLinkedProfileId } from '@/lib/txFormat';
import { useProfilesStore } from '@/store/useProfilesStore';

/** Format an ISO timestamp → "May 28, 2026 · 3:45 PM" */
function fmtTimestamp(ts: any): string {
  if (!ts) return '—';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return String(ts); }
}

function getDeleteMsg(
  tx: any,
  walletName: string,
  currency: string,
  hasLinked: boolean,
  fromWalletName?: string,
  toWalletName?: string,
) {
  const amt = fmtCurrency(tx.amount, currency);
  const w = walletName || 'your wallet';
  const linkedNote = hasLinked
    ? (tx.type === 'lent'
        ? '\nThe linked lending record will also be deleted.'
        : '\nThe linked debt record will also be deleted.')
    : '';

  switch (tx.type) {
    case 'income':
      return {
        action: `${amt} will be deducted from ${w}`,
        detail: 'This income record will be permanently removed. Your wallet balance will go back to what it was before this income was recorded.',
        bullets: ['Income record deleted forever', `${w} balance reduced by ${amt}`, 'Removed from income analytics & reports'],
      };
    case 'expense':
      return {
        action: `${amt} will be returned to ${w}`,
        detail: 'This expense will be reversed. Your wallet balance will be restored as if this expense never happened.',
        bullets: ['Expense record deleted forever', `${w} balance restored by ${amt}`, 'Removed from expense analytics & reports'],
      };
    case 'debt':
      return {
        action: `${amt} will be deducted from ${w}`,
        detail: `This borrowed amount record will be removed. The wallet balance that was added when the debt was recorded will be reversed.${linkedNote}`,
        bullets: ['Debt transaction deleted forever', hasLinked ? 'Linked debt record also removed' : `${w} balance reduced by ${amt}`, 'Removed from debt analytics & reports'],
      };
    case 'lent':
      return {
        action: `${amt} will be returned to ${w}`,
        detail: `This lending record will be removed. The amount deducted when you lent this money will be restored to your wallet.${linkedNote}`,
        bullets: ['Lending transaction deleted forever', hasLinked ? 'Linked lending record also removed' : `${w} balance restored by ${amt}`, 'Removed from lending analytics & reports'],
      };
    case 'transfer': {
      const from = fromWalletName || 'source wallet';
      const to   = toWalletName   || 'destination wallet';
      return {
        action: `${amt} transfer will be reversed`,
        detail: `Deleting this transfer will restore ${from}'s balance by ${amt} and deduct ${amt} from ${to}. Net worth stays unchanged.`,
        bullets: [
          'Transfer record deleted forever',
          `${from} balance restored by ${amt}`,
          `${to} balance reduced by ${amt}`,
          'No impact on income / expense analytics',
        ],
      };
    }
    default:
      return {
        action: `${amt} will be adjusted in ${w}`,
        detail: 'This transaction will be permanently removed and its effect on your wallet balance will be reversed.',
        bullets: ['Transaction deleted forever', `${w} balance restored`, 'Removed from analytics & reports'],
      };
  }
}

interface Props {
  tx: any;
  visible: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  wallets?: any[];
  walletCurrency?: string;
}

export function TxDetailModal({ tx, visible, onClose, onDelete, wallets, walletCurrency }: Props) {
  const slideY  = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const profiles = useProfilesStore(s => s.profiles);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      slideY.setValue(300); opacity.setValue(0); setConfirmDelete(false);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200, mass: 0.9 }),
      ]).start();
    }
  }, [visible]);

  if (!tx) return null;

  const isTransfer   = tx.type === 'transfer';
  const wallet       = wallets ? wallets.find((w: any) => w.id === tx.walletId) : null;
  const fromWallet   = isTransfer && wallets ? wallets.find((w: any) => w.id === tx.fromWalletId) : null;
  const toWallet     = isTransfer && wallets ? wallets.find((w: any) => w.id === tx.toWalletId)   : null;
  const currency     = walletCurrency || wallet?.currency || 'BDT';
  const typeColor    = TX_TYPE_COLOR[tx.type] || '#94a3b8';
  const hasLinked    = !!(tx.linkedRecordId);
  const walletName   = wallet?.name || '';
  const msg          = getDeleteMsg(tx, walletName, currency, hasLinked, fromWallet?.name, toWallet?.name);
  const timeLabel    = fmtTimestamp(tx.createdAt || tx.date);
  const showPfp      = (tx.type === 'debt' || tx.type === 'lent') && tx.profilePic;

  const linkedProfileId  = getLinkedProfileId(tx);
  const isProfileDeleted = !!linkedProfileId && !profiles.some(p => p.id === linkedProfileId);

  // Icon
  const isPos   = tx.type === 'income' || tx.type === 'debt';
  const sign    = isTransfer ? '' : (isPos ? '+' : '-');
  const icon    = isTransfer
    ? '⇄'
    : CATEGORY_ICONS[tx.category || ''] || (tx.type === 'lent' ? '🤝' : tx.type === 'debt' ? '💸' : '📦');
  const iconBg  = isTransfer ? typeColor : (CATEGORY_COLORS[tx.category || ''] || typeColor);

  // Transfer display title
  const displayTitle = isTransfer
    ? `${fromWallet?.name || '—'} → ${toWallet?.name || '—'}`
    : tx.title;

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} statusBarTranslucent animationType="none">
      <Pressable style={s.overlay} onPress={onClose}>
        <Animated.View style={[s.sheet, { opacity, transform: [{ translateY: slideY }] }]}>
          <Pressable>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.sheet }]} />
            <View style={{ position: 'absolute', top: -50, right: -50, alignItems: 'center', justifyContent: 'center' }}>
              <GlowOrb color={typeColor} size={160} />
            </View>
            <View style={{ position: 'absolute', bottom: -40, left: -40, alignItems: 'center', justifyContent: 'center' }}>
              <GlowOrb color="#3b82f6" size={120} />
            </View>
            <View style={s.handle} />

            {/* Icon area */}
            {showPfp ? (
              <View style={s.pfpWrap}>
                <Image source={{ uri: tx.profilePic }} style={[s.pfpImg, { borderColor: typeColor + '60' }]} />
                <View style={[s.pfpTypeBadge, { backgroundColor: typeColor }]}>
                  <Text style={s.pfpTypeBadgeText}>{tx.type === 'lent' ? '🤝' : '💸'}</Text>
                </View>
              </View>
            ) : (
              <View style={[
                s.iconCircle,
                isTransfer
                  ? { backgroundColor: typeColor + '22' }
                  : { backgroundColor: iconBg + '26' },
              ]}>
                <Text style={[s.iconEmoji, isTransfer && { color: typeColor }]}>{icon}</Text>
              </View>
            )}

            {/* Amount */}
            <Text style={[s.amount, { color: typeColor }]}>
              {sign}{fmtCurrency(tx.amount, currency)}
            </Text>

            {/* Title */}
            <Text style={s.title}>{displayTitle}</Text>

            {/* Transfer sub-label */}
            {isTransfer && (
              <View style={[s.transferBadge, { backgroundColor: typeColor + '22' }]}>
                <Ionicons name="swap-horizontal" size={11} color={typeColor} />
                <Text style={[s.transferBadgeText, { color: typeColor }]}>Wallet Transfer</Text>
              </View>
            )}

            {/* Timestamp pill */}
            <View style={s.timePill}>
              <Ionicons name="time-outline" size={11} color={COLORS.textFaint} />
              <Text style={s.timeText}>{timeLabel}</Text>
            </View>

            {/* Details card */}
            <View style={s.detailsCard}>
              {[
                { label: 'Type',     value: tx.type?.charAt(0).toUpperCase() + tx.type?.slice(1) },
                isTransfer && fromWallet ? { label: 'From',     value: fromWallet.name } : null,
                isTransfer && toWallet   ? { label: 'To',       value: toWallet.name   } : null,
                !isTransfer && tx.category ? { label: 'Category', value: tx.category } : null,
                !isTransfer ? { label: 'Wallet',   value: walletName || '—' } : null,
                tx.personName ? { label: 'Person',  value: tx.personName } : null,
                tx.notes      ? { label: 'Note',    value: tx.notes      } : null,
              ].filter(Boolean).map((row: any, i: number) => (
                <View key={i} style={[s.detailRow, i > 0 && s.detailRowBorder]}>
                  <Text style={s.detailLabel}>{row.label}</Text>
                  {row.label === 'Person' && isProfileDeleted ? (
                    <Text style={s.detailValue} numberOfLines={3}>
                      {row.value} <Text style={s.deletedNote}>· Profile deleted</Text>
                    </Text>
                  ) : (
                    <Text style={s.detailValue} numberOfLines={3}>{row.value}</Text>
                  )}
                </View>
              ))}
            </View>

            {/* Delete / Confirm */}
            {!confirmDelete ? (
              <TouchableOpacity style={s.deleteBtn} onPress={() => setConfirmDelete(true)} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={s.deleteBtnText}>Delete {isTransfer ? 'Transfer' : 'Transaction'}</Text>
                {hasLinked && (
                  <View style={s.linkedBadge}>
                    <Text style={s.linkedBadgeText}>+ linked record</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <View style={s.confirmCard}>
                <View style={s.confirmIconRow}>
                  <View style={s.confirmIconCircle}>
                    <Text style={s.confirmIconEmoji}>⚠️</Text>
                  </View>
                  <Text style={s.confirmTitle}>Delete permanently?</Text>
                </View>
                <Text style={s.confirmAction}>
                  <Text style={s.confirmHighlight}>{msg.action}</Text>
                </Text>
                <Text style={s.confirmDetail}>{msg.detail}</Text>
                <View style={s.confirmBullets}>
                  {msg.bullets.map((b, i) => (
                    <Text key={i} style={s.confirmBullet}>• {b}</Text>
                  ))}
                </View>
                <View style={s.confirmBtns}>
                  <TouchableOpacity style={s.confirmCancel} onPress={() => setConfirmDelete(false)} activeOpacity={0.8}>
                    <Text style={s.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.confirmDelete} activeOpacity={0.8}
                    onPress={() => { onDelete(tx.id); setConfirmDelete(false); onClose(); }}
                  >
                    <Ionicons name="trash-outline" size={13} color="#fff" />
                    <Text style={s.confirmDeleteText}>Confirm Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={{ height: insets.bottom + 16 }} />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', ...SHADOW.sheet },
  handle:  { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2, alignSelf: 'center', marginTop: 14, marginBottom: 20 },

  pfpWrap:         { alignSelf: 'center', position: 'relative', marginBottom: 14 },
  pfpImg:          { width: 80, height: 80, borderRadius: 40, borderWidth: 2.5 },
  pfpTypeBadge:    { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(5,9,18,0.99)' },
  pfpTypeBadgeText:{ fontSize: 13 },

  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  iconEmoji:  { fontSize: 32 },

  amount: { fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -1, marginBottom: 4 },
  title:  { color: COLORS.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 6, paddingHorizontal: 24 },

  transferBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 6 },
  transferBadgeText:{ fontSize: 11, fontWeight: '600' },

  timePill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginBottom: 20 },
  timeText: { color: COLORS.textFaint, fontSize: 11.5, fontWeight: '500' },

  detailsCard:    { marginHorizontal: 20, backgroundColor: COLORS.cardElevated, borderRadius: 18, marginBottom: 16, overflow: 'hidden', ...SHADOW.raised },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, alignItems: 'flex-start' },
  detailRowBorder:{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  detailLabel:    { color: COLORS.textFaint, fontSize: 13, fontWeight: '600', flexShrink: 0 },
  detailValue:    { color: COLORS.text, fontSize: 13, fontWeight: '700', maxWidth: '62%', textAlign: 'right', lineHeight: 19 },
  deletedNote:    { color: '#ef4444', fontSize: 11, fontWeight: '800' },

  deleteBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.12)' },
  deleteBtnText:  { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  linkedBadge:    { backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  linkedBadgeText:{ color: '#fca5a5', fontSize: 10, fontWeight: '600' },

  confirmCard:       { marginHorizontal: 20, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 18, padding: 18, ...SHADOW.raised },
  confirmIconRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  confirmIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(239,68,68,0.2)', alignItems: 'center', justifyContent: 'center' },
  confirmIconEmoji:  { fontSize: 16 },
  confirmTitle:      { color: '#fff', fontSize: 15, fontWeight: '800' },
  confirmAction:     { fontSize: 13, fontWeight: '500', color: COLORS.textMuted, marginBottom: 8, lineHeight: 19 },
  confirmHighlight:  { color: '#fff', fontWeight: '700' },
  confirmDetail:     { color: COLORS.textFaint, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  confirmBullets:    { gap: 5, marginBottom: 16 },
  confirmBullet:     { color: COLORS.textFaint, fontSize: 11.5, lineHeight: 17 },
  confirmBtns:       { flexDirection: 'row', gap: 10 },
  confirmCancel:     { flex: 1, paddingVertical: 13, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, alignItems: 'center' },
  confirmCancelText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  confirmDelete:     { flex: 1, paddingVertical: 13, backgroundColor: 'rgba(239,68,68,0.85)', borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  confirmDeleteText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
