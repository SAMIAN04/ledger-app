// app/modals/wallet-detail.tsx — Redesigned header, transfer icon, transfer-aware delete
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { useFirestore } from '@/hooks/useFirestore';
import { useDeleteTransaction } from '@/hooks/useDeleteTransaction';
import { fmtCurrency } from '@/lib/currency';
import { WALLET_EMOJI, CATEGORY_ICONS, CATEGORY_COLORS, TX_TYPE_COLOR, NEON_BLUE } from '@/constants/data';
import { WALLET_COLORS } from '@/constants/walletColors';
import { InputField } from '@/components/ui/InputField';
import { GradientButton } from '@/components/ui/GradientButton';
import { GlassModal, GlowOrb } from '@/components/ui/GlassModal';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';
import { TxDetailModal } from '@/components/ui/TxDetailModal';
import { ConfirmDeleteSheet } from '@/components/ui/ConfirmDeleteSheet';
import { ProfileDeletedBadge } from '@/components/ui/ProfileDeletedBadge';
import { PressRow } from '@/components/ui/PressRow';
import { sortWallets } from '@/utils/walletSort';
import { getLinkedProfileId } from '@/lib/txFormat';
import { useProfilesStore } from '@/store/useProfilesStore';

export default function WalletDetailModal() {
  const router   = useRouter();
  const { walletId, edit } = useLocalSearchParams<{ walletId: string; edit?: string }>();
  const { wallets, transactions } = useAppStore();
  const { fbUpdate, fbDelete } = useFirestore();
  const { deleteTransaction } = useDeleteTransaction();
  const profiles = useProfilesStore(s => s.profiles);

  const sortedWallets = sortWallets(wallets);
  const w   = sortedWallets.find((x) => x.id === walletId);
  // All txs for this wallet: includes transfers where this is the source (walletId)
  // or the destination (toWalletId)
  const txs = transactions.filter(
    (t) => t.walletId === walletId || t.toWalletId === walletId,
  );

  const [isEdit,      setIsEdit]      = useState(edit === '1');
  const [editName,    setEditName]    = useState(w?.name || '');
  const [editColor,   setEditColor]   = useState(w?.color || '#22c55e');
  const [editDesc,    setEditDesc]    = useState(w?.description || '');
  const [editBalance, setEditBalance] = useState(String(w?.balance || ''));
  const [editLogo,    setEditLogo]    = useState<string | null>(w?.logo || null);
  const [saving,      setSaving]      = useState(false);
  const [selectedTx,  setSelectedTx]  = useState<any>(null);
  const [txDetailVisible, setTxDetailVisible] = useState(false);
  const [deleteWalletVisible, setDeleteWalletVisible] = useState(false);
  const [deletingWallet, setDeletingWallet] = useState(false);

  if (!w) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <GlassModal accentColor="#10b981">
          <View style={styles.notFound}>
            <Text style={styles.notFoundText}>Wallet not found</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backLink}>Go back</Text>
            </TouchableOpacity>
          </View>
        </GlassModal>
      </SafeAreaView>
    );
  }

  const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const sym = w.currency || 'BDT';
  const wColor = w.color || '#22c55e';

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.6,
    });
    if (!result.canceled && result.assets[0].base64) {
      setEditLogo('data:image/jpeg;base64,' + result.assets[0].base64);
    }
  }

  async function saveEdit() {
    if (!editName.trim()) { Alert.alert('Required', 'Wallet name is required.'); return; }
    setSaving(true);
    try {
      await fbUpdate('wallets', walletId, {
        name: editName.trim(), color: editColor, description: editDesc,
        balance: parseFloat(editBalance) || w.balance, logo: editLogo || null,
      });
      setIsEdit(false);
    } catch { Alert.alert('Error', 'Failed to save.'); }
    finally { setSaving(false); }
  }

  function deleteWallet() {
    setDeleteWalletVisible(true);
  }

  async function confirmDeleteWallet() {
    setDeletingWallet(true);
    try {
      await fbDelete('wallets', walletId);
      setDeleteWalletVisible(false);
      router.back();
    } finally {
      setDeletingWallet(false);
    }
  }

  async function handleDeleteTx(txId: string) {
    await deleteTransaction(txId, () => setTxDetailVisible(false));
  }

  // ── Transfer label helper ──────────────────────────────────────────────────
  function getTransferLabel(tx: any): string {
    if (tx.type !== 'transfer') return tx.title;
    const isOutgoing = tx.fromWalletId === walletId;
    if (isOutgoing) {
      const dest = sortedWallets.find(w => w.id === tx.toWalletId);
      return `Sent to ${dest?.name || 'wallet'}`;
    }
    const src = sortedWallets.find(w => w.id === tx.fromWalletId || w.id === tx.walletId);
    return `Received from ${src?.name || 'wallet'}`;
  }

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (!isEdit) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <GlassModal accentColor={wColor} secondaryColor="#1e3a5f">
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Hero section */}
            <View style={styles.heroSection}>
              <LinearGradient colors={[wColor + '18', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={{ position: 'absolute', top: -40, right: -40, alignItems: 'center', justifyContent: 'center' }}>
                <GlowOrb color={wColor} size={160} />
              </View>
              <View style={{ position: 'absolute', bottom: -20, left: -30, alignItems: 'center', justifyContent: 'center' }}>
                <GlowOrb color="#3b82f6" size={120} />
              </View>

              {/* ── NEW HEADER: ← | | ✏️ ⇄ ──────────────────────────────── */}
              <View style={styles.heroHeader}>
                {/* Back arrow (top left) */}
                <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
                  <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>

                {/* Right icon group: edit + transfer */}
                <View style={styles.headerRight}>
                  <TouchableOpacity
                    onPress={() => setIsEdit(true)}
                    style={styles.iconBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pencil-outline" size={17} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({ pathname: '/modals/transfer' as any, params: { fromWalletId: walletId } })
                    }
                    style={[styles.iconBtn, styles.transferIconBtn]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="swap-horizontal" size={17} color={NEON_BLUE} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Wallet identity row */}
              <View style={styles.heroIdentity}>
                <View style={[styles.heroIcon, { backgroundColor: wColor + '33' }]}>
                  {w.logo
                    ? <Image source={{ uri: w.logo }} style={styles.heroLogo} />
                    : <Text style={styles.heroEmoji}>{WALLET_EMOJI[w.type] || '💰'}</Text>
                  }
                </View>
                <View>
                  <Text style={styles.heroName}>{w.name}</Text>
                  <Text style={styles.heroType}>{w.type} · {w.currency}</Text>
                </View>
              </View>

              <Text style={[styles.heroBalance, { color: wColor }]}>{fmtCurrency(w.balance || 0, sym)}</Text>
              <Text style={styles.txCountBadge}>{txs.length} transaction{txs.length !== 1 ? 's' : ''}</Text>

              <View style={styles.heroStats}>
                <View style={[styles.heroStat, { backgroundColor: 'rgba(16,185,129,0.14)' }]}>
                  <Text style={styles.heroStatLabel}>INCOME</Text>
                  <Text style={[styles.heroStatVal, { color: '#10b981' }]}>{fmtCurrency(inc, sym)}</Text>
                </View>
                <View style={[styles.heroStat, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                  <Text style={styles.heroStatLabel}>EXPENSES</Text>
                  <Text style={[styles.heroStatVal, { color: '#ef4444' }]}>{fmtCurrency(exp, sym)}</Text>
                </View>
              </View>
              {!!w.description && <Text style={styles.heroDesc}>{w.description}</Text>}
            </View>

            {/* Transactions */}
            <View style={styles.txSection}>
              <Text style={styles.txSectionTitle}>TRANSACTIONS  ·  {txs.length}</Text>
              {txs.length === 0
                ? <View style={styles.emptyWrap}><Text style={styles.emptyText}>No transactions for this wallet</Text></View>
                : txs.map((tx) => {
                    const typeColor = TX_TYPE_COLOR[tx.type] || COLORS.textMuted;
                    const isTransfer = tx.type === 'transfer';
                    const isIncoming = isTransfer && tx.toWalletId === walletId;
                    const isPos     = tx.type === 'income' || tx.type === 'debt' || isIncoming;
                    const showPfp   = (tx.type === 'debt' || tx.type === 'lent') && tx.profilePic;

                    const linkedProfileId  = getLinkedProfileId(tx);
                    const isProfileDeleted = !!linkedProfileId && !profiles.some(p => p.id === linkedProfileId);

                    const icon = isTransfer
                      ? '⇄'
                      : CATEGORY_ICONS[tx.category || ''] || (tx.type === 'lent' ? '🤝' : tx.type === 'debt' ? '💸' : '📦');
                    const iconBg = CATEGORY_COLORS[tx.category || ''] || typeColor;
                    const label  = isTransfer ? getTransferLabel(tx) : tx.title;

                    let timeStr = tx.date || '';
                    try {
                      const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : (tx.createdAt ? new Date(tx.createdAt) : null);
                      if (d && !isNaN(d.getTime())) {
                        timeStr = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                      }
                    } catch {}

                    return (
                      <PressRow key={tx.id} onPress={() => { setSelectedTx(tx); setTxDetailVisible(true); }} style={{ marginBottom: 8 }}>
                        <View style={styles.txRow}>
                          <View style={styles.txRowInner}>
                            <View style={[styles.txRowContent, isProfileDeleted && styles.txRowContentDisabled]}>
                              {showPfp
                                ? (
                                  <View style={{ position: 'relative', flexShrink: 0 }}>
                                    <Image source={{ uri: tx.profilePic }} style={[styles.txPfp, { borderColor: typeColor + '50' }]} />
                                    <View style={[styles.txPfpBadge, { backgroundColor: typeColor }]}>
                                      <Text style={{ fontSize: 7 }}>{tx.type === 'lent' ? '🤝' : '💸'}</Text>
                                    </View>
                                  </View>
                                )
                                : (
                                  <View style={[
                                    styles.txIcon,
                                    isTransfer
                                      ? { backgroundColor: NEON_BLUE + '24' }
                                      : { backgroundColor: iconBg + '20' },
                                  ]}>
                                    <Text style={[styles.txIconText, isTransfer && { color: NEON_BLUE }]}>{icon}</Text>
                                  </View>
                                )
                              }
                              <View style={styles.txInfo}>
                                <Text style={styles.txTitle} numberOfLines={1}>{label}</Text>
                                <Text style={styles.txMeta} numberOfLines={1}>{timeStr}</Text>
                              </View>
                              <Text style={[styles.txAmt, { color: typeColor }]}>
                                {isPos ? '+' : '-'}{fmtCurrency(tx.amount, sym)}
                              </Text>
                              <Ionicons name="chevron-forward" size={12} color={COLORS.textFaint} />
                            </View>
                            {isProfileDeleted && <ProfileDeletedBadge />}
                          </View>
                        </View>
                      </PressRow>
                    );
                  })
              }
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </GlassModal>

        <TxDetailModal
          tx={selectedTx}
          visible={txDetailVisible}
          onClose={() => setTxDetailVisible(false)}
          onDelete={handleDeleteTx}
          wallets={sortedWallets}
          walletCurrency={sym}
        />
      </SafeAreaView>
    );
  }

  // ── EDIT VIEW ────────────────────────────────────────────────────────────
  const walletDeleteSummary = Math.abs(w.balance) > 0.009
    ? `${fmtCurrency(Math.abs(w.balance), sym)} will no longer be counted in your total balance`
    : undefined;
  const walletDeleteBullets = [
    ...(txs.length > 0
      ? [`${txs.length} transaction${txs.length === 1 ? '' : 's'} linked to "${w.name}" will remain, but won't show a wallet name`]
      : []),
    `"${w.name}" cannot be recovered after this`,
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <GlassModal accentColor={editColor} secondaryColor="#1e3a5f">
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setIsEdit(false)} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Edit Wallet</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={styles.editBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
          <InputField label="Wallet Name" value={editName} onChangeText={setEditName} />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Wallet Logo</Text>
            <TouchableOpacity onPress={pickLogo} style={styles.logoPicker} activeOpacity={0.8}>
              {editLogo
                ? <View style={styles.logoPreviewRow}><Image source={{ uri: editLogo }} style={styles.logoPreviewImg} /><Text style={styles.logoChangeText}>Tap to change logo ✓</Text></View>
                : <View style={styles.logoPlaceholder}><Text style={styles.logoPlaceholderIcon}>🖼</Text><Text style={styles.logoPlaceholderText}>Tap to upload logo</Text></View>
              }
            </TouchableOpacity>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Color</Text>
            <View style={styles.colorRow}>
              {WALLET_COLORS.map((c) => (
                <TouchableOpacity key={c} onPress={() => setEditColor(c)} style={[styles.colorDot, { backgroundColor: c }, editColor === c && styles.colorDotActive]} activeOpacity={0.8} />
              ))}
            </View>
          </View>
          <InputField label="Balance" value={editBalance} onChangeText={setEditBalance} keyboardType="decimal-pad" />
          <InputField label="Description" value={editDesc} onChangeText={setEditDesc} placeholder="Optional description" />
          <View style={styles.editFooter}>
            <TouchableOpacity onPress={deleteWallet} style={styles.deleteBtn} activeOpacity={0.85}>
              <LinearGradient colors={['#ef4444', '#b91c1c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.deleteBtnGrad}>
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </LinearGradient>
            </TouchableOpacity>
            <View style={styles.editFooterRight}>
              <TouchableOpacity onPress={() => setIsEdit(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <GradientButton label="Save" onPress={saveEdit} loading={saving} style={styles.saveBtn} />
            </View>
          </View>
        </ScrollView>
      </GlassModal>

      <ConfirmDeleteSheet
        visible={deleteWalletVisible}
        onCancel={() => setDeleteWalletVisible(false)}
        onConfirm={confirmDeleteWallet}
        loading={deletingWallet}
        title={`Delete "${w.name}"?`}
        actionSummary={walletDeleteSummary}
        detail="This permanently removes the wallet from your accounts."
        bullets={walletDeleteBullets}
        confirmLabel="Delete Wallet"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: COLORS.sheet },
  notFound:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText:  { color: COLORS.textMuted, fontSize: 16 },
  backLink:      { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  // Hero
  heroSection:   { padding: 24, paddingTop: 40, position: 'relative', overflow: 'hidden', gap: 7 },
  // New header row
  heroHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerRight:   { flexDirection: 'row', gap: 8 },
  iconBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  transferIconBtn: { backgroundColor: 'rgba(0,212,255,0.16)' },
  // Wallet identity
  heroIdentity:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  heroIcon:      { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  heroLogo:      { width: 48, height: 48, borderRadius: 16 },
  heroEmoji:     { fontSize: 24 },
  heroName:      { color: '#fff', fontWeight: '800', fontSize: 17 },
  heroType:      { color: COLORS.textSlate, fontSize: 11, textTransform: 'capitalize', marginTop: 2 },
  heroBalance:   { fontSize: 33, fontWeight: '900', letterSpacing: -1.5, marginBottom: 4 },
  txCountBadge:  { color: COLORS.textFaint, fontSize: 11, marginBottom: 12 },
  heroStats:     { flexDirection: 'row', gap: 8 },
  heroStat:      { flex: 1, borderRadius: 10, padding: 10 },
  heroStatLabel: { color: COLORS.textFaint, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  heroStatVal:   { fontWeight: '700', fontSize: 14 },
  heroDesc:      { color: COLORS.textFaint, fontSize: 12, marginTop: 8, lineHeight: 18 },
  // Transactions
  txSection:     { padding: 20 },
  txSectionTitle:{ color: COLORS.textSlate, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },
  emptyWrap:     { paddingVertical: 32, alignItems: 'center' },
  emptyText:     { color: COLORS.textFaint, fontSize: 13 },
  txRow:         { borderRadius: RADIUS.lg, backgroundColor: COLORS.card, ...SHADOW.row },
  txRowInner:    { position: 'relative', overflow: 'hidden', borderRadius: RADIUS.lg, backgroundColor: COLORS.card, padding: 12 },
  txRowContent:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  txRowContentDisabled: { opacity: 0.35 },
  txIcon:        { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txIconText:    { fontSize: 16 },
  txPfp:         { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  txPfpBadge:    { position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.card },
  txInfo:        { flex: 1 },
  txTitle:       { color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 },
  txMeta:        { color: COLORS.textFaint, fontSize: 11, marginTop: 2 },
  txAmt:         { fontWeight: '700', fontSize: 13 },
  // Edit view
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
  modalTitle:    { color: '#fff', fontSize: 18, fontWeight: '700' },
  editBody:      { padding: 20, paddingBottom: 40 },
  field:         { marginBottom: 16 },
  fieldLabel:    { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  logoPicker:    { borderRadius: RADIUS.md, padding: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', ...SHADOW.row },
  logoPreviewRow:{ alignItems: 'center', gap: 8 },
  logoPreviewImg:{ width: 56, height: 56, borderRadius: 12 },
  logoChangeText:{ color: COLORS.primary, fontSize: 13 },
  logoPlaceholder:     { alignItems: 'center', gap: 6 },
  logoPlaceholderIcon: { fontSize: 26 },
  logoPlaceholderText: { color: COLORS.textFaint, fontSize: 13 },
  colorRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot:      { width: 32, height: 32, borderRadius: 16 },
  colorDotActive:{ borderWidth: 3, borderColor: '#fff', transform: [{ scale: 1.15 }] },
  editFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 },
  deleteBtn:     { borderRadius: RADIUS.sm, overflow: 'hidden' },
  deleteBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12 },
  deleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  editFooterRight:{ flexDirection: 'row', gap: 10 },
  cancelBtn:     { paddingHorizontal: 20, paddingVertical: 12, borderRadius: RADIUS.sm, backgroundColor: 'rgba(255,255,255,0.09)' },
  cancelText:    { color: COLORS.textSlate, fontWeight: '600', fontSize: 14 },
  saveBtn:       { minWidth: 80 },
});
