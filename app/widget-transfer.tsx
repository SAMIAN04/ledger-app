// app/widget-transfer.tsx
//
// Deep-link target for the widget's Transfer (⇄) button.
// URL: ledger://widget-transfer  →  expo-router route /widget-transfer
//
// Unlike the wallet-detail transfer modal (which pre-fills the source),
// this widget version lets the user pick BOTH source and destination wallets.
// UI follows the same design language as /modals/transfer.tsx.
//
// FIX (data update): Previously the widget balance wasn't updated after
// a successful transfer because moveTaskToBack() fires when this component
// unmounts (immediately after router navigation), which happens ~5ms after
// the transfer saves. The debounced useWidgetSync (400ms) hadn't had time
// to write new balances to SharedPreferences. Fix: call updateWidgetData()
// directly with fresh Zustand state right after fbTransfer() resolves,
// before navigating away. This guarantees the widget shows the correct
// balance the instant the user returns to their home screen.

import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { useFirestore } from '@/hooks/useFirestore';
import { fmtCurrency, getCurrencySymbol, convertToPreferred } from '@/lib/currency';
import { WALLET_EMOJI, NEON_BLUE } from '@/constants/data';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GradientButton } from '@/components/ui/GradientButton';
import { GlassModal } from '@/components/ui/GlassModal';
import { COLORS, RADIUS } from '@/constants/theme';
import { sortWallets } from '@/utils/walletSort';
import { moveTaskToBack, updateWidgetData } from '@/modules/widget-bridge';

// ─── Small helper: replicate the number formatter used by useWidgetSync ───────
function fmtWidgetNumber(n: number): string {
  if (isNaN(n) || !isFinite(n)) return '0';
  return Number(n.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function WidgetTransferModal() {
  const router               = useRouter();
  const authReady            = useAppStore((s) => s.authReady);
  const uid                  = useAppStore((s) => s.uid);
  const setLaunchedFromWidget = useAppStore((s) => s.setLaunchedFromWidget);
  const { wallets } = useAppStore();
  const { fbTransfer } = useFirestore();

  // Redirect once auth has actually resolved — gating on `hydrated` alone
  // races ahead of Firebase Auth's session restore on a cold start, which
  // would bounce this screen to /(auth)/login while uid is still null.
  // See widget-expense.tsx for the full explanation.
  useEffect(() => {
    if (!authReady) return;
    if (!uid) { router.replace('/(auth)/login'); return; }
    setLaunchedFromWidget(true);
  }, [authReady, uid]);

  const sortedWallets = useMemo(() => sortWallets(wallets), [wallets]);

  // Cold start can leave this as the only entry in the stack, where back()
  // would be a no-op. Fall back to Home so Cancel/back always do something.
  const goBackOrHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  // If this session started from a home-screen-widget tap, recede the app
  // to the background once this screen goes away — covers every dismiss
  // path (Transfer, Cancel, back button, swipe-to-dismiss, Android hardware
  // back) since they all unmount this screen. The user should only ever
  // see the widget + this form, never the app itself.
  useEffect(() => {
    return () => {
      if (useAppStore.getState().launchedFromWidget) {
        useAppStore.getState().setLaunchedFromWidget(false);
        moveTaskToBack();
      }
    };
  }, []);

  const [fromWalletId, setFromWalletId] = useState('');
  const [toWalletId,   setToWalletId]   = useState('');
  const [amount, setAmount]             = useState('');
  const [date, setDate]                 = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes]               = useState('');
  const [saving, setSaving]             = useState(false);

  const fromWallet = sortedWallets.find(w => w.id === fromWalletId);
  const toWallet   = sortedWallets.find(w => w.id === toWalletId);

  // All wallets as options
  const fromOptions = useMemo(
    () =>
      sortedWallets.map(w => ({
        value: w.id,
        label: `${WALLET_EMOJI[w.type] || '💰'} ${w.name}  (${fmtCurrency(w.balance || 0, w.currency || 'BDT')})`,
      })),
    [sortedWallets],
  );

  // Destination excludes the selected source
  const toOptions = useMemo(
    () =>
      sortedWallets
        .filter(w => w.id !== fromWalletId)
        .map(w => ({
          value: w.id,
          label: `${WALLET_EMOJI[w.type] || '💰'} ${w.name}  (${fmtCurrency(w.balance || 0, w.currency || 'BDT')})`,
        })),
    [sortedWallets, fromWalletId],
  );

  // Clear destination if it became the same as source
  useEffect(() => {
    if (fromWalletId && toWalletId === fromWalletId) setToWalletId('');
  }, [fromWalletId]);

  // ── Force-sync widget balance immediately after a successful transfer ───────
  // useWidgetSync debounces at 400 ms; moveTaskToBack() fires ~5 ms after
  // navigation, so the debounce never runs in time. Calling updateWidgetData()
  // directly here ensures the home-screen widget reflects the new balance the
  // instant the user is back on their home screen.
  async function syncWidgetNow() {
    try {
      const store = useAppStore.getState();
      const fresh = sortWallets(store.wallets);
      const pref  = store.preferredCurrency || 'BDT';
      const sym   = getCurrencySymbol(pref);

      const total = fresh.reduce(
        (s, w) => s + convertToPreferred(w.balance || 0, w.currency || 'BDT', pref),
        0,
      );

      await updateWidgetData(
        'Total Balance',
        `${sym}\u00A0${fmtWidgetNumber(total)}`,
        fresh.map(w => ({
          id:      w.id,
          name:    w.name || 'Wallet',
          balance: `${sym}\u00A0${fmtWidgetNumber(
            convertToPreferred(w.balance || 0, w.currency || 'BDT', pref),
          )}`,
        })),
      );
    } catch (_) {
      // Non-fatal — widget will self-correct via the next debounced sync
    }
  }

  async function handleTransfer() {
    const amt = parseFloat(amount);
    if (!fromWalletId)              { Alert.alert('Validation', 'Please select a source wallet.');      return; }
    if (!toWalletId)                { Alert.alert('Validation', 'Please select a destination wallet.'); return; }
    if (toWalletId === fromWalletId){ Alert.alert('Validation', 'Source and destination cannot be the same.'); return; }
    if (!amt || amt <= 0)           { Alert.alert('Validation', 'Amount must be greater than 0.');      return; }

    setSaving(true);
    try {
      await fbTransfer({ fromWalletId, toWalletId, amount: amt, date, notes: notes.trim() || undefined });

      // Immediately push the updated balances to the Android widget so it
      // reflects the transfer the moment the user is back on their home screen.
      // This runs before moveTaskToBack() (which fires on unmount), so the
      // SharedPreferences write is guaranteed to complete first.
      await syncWidgetNow();

      // Cold start can leave this as the only entry in the stack — fall back
      // to Home instead of a no-op back() that would leave the modal open.
      goBackOrHome();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Transfer failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Loading state while auth/store hydrates
  if (!authReady) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={NEON_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <GlassModal accentColor={NEON_BLUE} secondaryColor="#003d52">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* ── Header ───────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <TouchableOpacity onPress={goBackOrHome} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <View style={styles.transferIconWrap}>
                <Ionicons name="swap-horizontal" size={18} color={NEON_BLUE} />
              </View>
              <Text style={styles.headerTitle}>Transfer Money</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >

            {/* ── From Wallet ──────────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TRANSFER FROM</Text>
              <SelectField
                label=""
                value={fromWalletId}
                options={fromOptions}
                onChange={setFromWalletId}
                placeholder="Select source wallet"
              />
              {fromWallet && (
                <LinearGradient
                  colors={[fromWallet.color + '22', fromWallet.color + '08']}
                  style={[styles.walletCard, { borderColor: fromWallet.color + '40', marginTop: 8 }]}
                >
                  <View style={[styles.walletDot, { backgroundColor: fromWallet.color }]} />
                  <View style={styles.walletInfo}>
                    <Text style={styles.walletCardName}>{fromWallet.name}</Text>
                    <Text style={[styles.walletCardBal, { color: fromWallet.color }]}>
                      {fmtCurrency(fromWallet.balance || 0, fromWallet.currency || 'BDT')}
                    </Text>
                  </View>
                  <Text style={styles.walletEmoji}>{WALLET_EMOJI[fromWallet.type] || '💰'}</Text>
                </LinearGradient>
              )}
            </View>

            {/* ── Arrow divider ─────────────────────────────────────────────── */}
            <View style={styles.arrowRow}>
              <View style={styles.arrowLine} />
              <View style={[styles.arrowCircle, { backgroundColor: NEON_BLUE + '20', borderColor: NEON_BLUE + '50' }]}>
                <Ionicons name="arrow-down" size={16} color={NEON_BLUE} />
              </View>
              <View style={styles.arrowLine} />
            </View>

            {/* ── To Wallet ────────────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TRANSFER TO</Text>
              <SelectField
                label=""
                value={toWalletId}
                options={toOptions}
                onChange={setToWalletId}
                placeholder={fromWalletId ? 'Select destination wallet' : 'Select source wallet first'}
              />
              {toWallet && (
                <LinearGradient
                  colors={[toWallet.color + '22', toWallet.color + '08']}
                  style={[styles.walletCard, { borderColor: toWallet.color + '40', marginTop: 8 }]}
                >
                  <View style={[styles.walletDot, { backgroundColor: toWallet.color }]} />
                  <View style={styles.walletInfo}>
                    <Text style={styles.walletCardName}>{toWallet.name}</Text>
                    <Text style={[styles.walletCardBal, { color: toWallet.color }]}>
                      {fmtCurrency(toWallet.balance || 0, toWallet.currency || 'BDT')}
                    </Text>
                  </View>
                  <Text style={styles.walletEmoji}>{WALLET_EMOJI[toWallet.type] || '💰'}</Text>
                </LinearGradient>
              )}
            </View>

            {/* ── Amount ───────────────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>AMOUNT</Text>
              <InputField
                label=""
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </View>

            {/* ── Date ─────────────────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DATE</Text>
              <DatePickerField
                label=""
                value={date}
                onChange={setDate}
              />
            </View>

            {/* ── Note ─────────────────────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTE (OPTIONAL)</Text>
              <InputField
                label=""
                value={notes}
                onChangeText={setNotes}
                placeholder="Add a note..."
                multiline
              />
            </View>

            {/* ── Preview ──────────────────────────────────────────────────── */}
            {!!parseFloat(amount) && fromWallet && toWallet && (
              <View style={styles.preview}>
                <LinearGradient
                  colors={[NEON_BLUE + '12', NEON_BLUE + '04']}
                  style={[styles.previewCard, { borderColor: NEON_BLUE + '30' }]}
                >
                  <Text style={styles.previewTitle}>Preview</Text>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>{fromWallet.name}</Text>
                    <Text style={[styles.previewVal, { color: '#ef4444' }]}>
                      -{fmtCurrency(parseFloat(amount) || 0, fromWallet.currency || 'BDT')}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>{toWallet.name}</Text>
                    <Text style={[styles.previewVal, { color: '#22c55e' }]}>
                      +{fmtCurrency(parseFloat(amount) || 0, toWallet.currency || 'BDT')}
                    </Text>
                  </View>
                  <View style={[styles.previewRow, styles.previewNetRow]}>
                    <Text style={[styles.previewLabel, { color: NEON_BLUE }]}>Net Worth Change</Text>
                    <Text style={[styles.previewVal, { color: NEON_BLUE }]}>৳0.00</Text>
                  </View>
                </LinearGradient>
              </View>
            )}

            {/* ── Footer buttons ─────────────────────────────────────────── */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={goBackOrHome}
                style={styles.cancelBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <GradientButton
                label="Transfer"
                onPress={handleTransfer}
                loading={saving}
                style={styles.transferBtn}
                colors={[NEON_BLUE, '#0099bb']}
              />
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </GlassModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: 'rgba(13,18,32,0.99)' },
  loadingWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Header
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  headerCenter:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:    { color: '#fff', fontWeight: '700', fontSize: 17 },
  transferIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#00D4FF20', borderWidth: 1, borderColor: '#00D4FF40', alignItems: 'center', justifyContent: 'center' },
  // Body
  body:           { padding: 20, gap: 4 },
  section:        { marginBottom: 20 },
  sectionLabel:   { color: COLORS.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  // Wallet card
  walletCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.lg, padding: 14, borderWidth: 1 },
  walletDot:      { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  walletInfo:     { flex: 1 },
  walletCardName: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  walletCardBal:  { fontWeight: '600', fontSize: 13, marginTop: 2 },
  walletEmoji:    { fontSize: 22 },
  // Arrow
  arrowRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  arrowLine:      { flex: 1, height: 1, backgroundColor: 'rgba(0,212,255,0.15)' },
  arrowCircle:    { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: 12 },
  // Preview
  preview:        { marginBottom: 20 },
  previewCard:    { borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, gap: 10 },
  previewTitle:   { color: NEON_BLUE, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  previewRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewNetRow:  { borderTopWidth: 1, borderTopColor: 'rgba(0,212,255,0.15)', paddingTop: 10, marginTop: 2 },
  previewLabel:   { color: COLORS.textMuted, fontSize: 13 },
  previewVal:     { fontWeight: '700', fontSize: 13 },
  // Footer
  footer:         { flexDirection: 'row', gap: 12 },
  cancelBtn:      { flex: 1, paddingVertical: 14, borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cancelText:     { color: COLORS.textSlate, fontWeight: '600', fontSize: 15 },
  transferBtn:    { flex: 2 },
});
