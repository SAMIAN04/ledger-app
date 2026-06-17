// app/modals/transfer.tsx — Wallet-to-Wallet Transfer
//
// Accessible only via the Transfer icon in Wallet Details.
// NOT reachable from the Add Transaction modal.
//
// Flow:
//   From Wallet  (pre-filled with current wallet, read-only)
//   To Wallet    (user picks from remaining wallets)
//   Amount       (must be > 0)
//   Date         (defaults to today)
//   Note         (optional)
//   [Cancel] [Transfer]

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { useFirestore } from '@/hooks/useFirestore';
import { fmtCurrency } from '@/lib/currency';
import { WALLET_EMOJI, NEON_BLUE } from '@/constants/data';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GradientButton } from '@/components/ui/GradientButton';
import { GlassModal } from '@/components/ui/GlassModal';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';
import { sortWallets } from '@/utils/walletSort';

export default function TransferModal() {
  const router = useRouter();
  const { fromWalletId } = useLocalSearchParams<{ fromWalletId: string }>();
  const { wallets } = useAppStore();
  const { fbTransfer } = useFirestore();

  const sortedWallets = useMemo(() => sortWallets(wallets), [wallets]);
  const fromWallet = sortedWallets.find(w => w.id === fromWalletId);

  const [toWalletId, setToWalletId] = useState('');
  const [amount, setAmount]         = useState('');
  const [date, setDate]             = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);

  // Destination options: all wallets except the source
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

  const toWallet = sortedWallets.find(w => w.id === toWalletId);

  async function handleTransfer() {
    const amt = parseFloat(amount);

    if (!fromWallet) { Alert.alert('Error', 'Source wallet not found.'); return; }
    if (!toWalletId)  { Alert.alert('Validation', 'Please select a destination wallet.'); return; }
    if (toWalletId === fromWalletId) { Alert.alert('Validation', 'Source and destination cannot be the same wallet.'); return; }
    if (!amt || amt <= 0) { Alert.alert('Validation', 'Amount must be greater than 0.'); return; }

    setSaving(true);
    try {
      await fbTransfer({ fromWalletId, toWalletId, amount: amt, date, notes: notes.trim() || undefined });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Transfer failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!fromWallet) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <GlassModal accentColor={NEON_BLUE}>
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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <GlassModal accentColor={NEON_BLUE} secondaryColor="#003d52">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
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
            {/* From Wallet — read-only display */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TRANSFER FROM</Text>
              <LinearGradient
                colors={[fromWallet.color + '22', fromWallet.color + '08']}
                style={styles.walletCard}
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
            </View>

            {/* Transfer icon arrow */}
            <View style={styles.arrowRow}>
              <View style={styles.arrowLine} />
              <View style={[styles.arrowCircle, { backgroundColor: NEON_BLUE + '20' }]}>
                <Ionicons name="arrow-down" size={16} color={NEON_BLUE} />
              </View>
              <View style={styles.arrowLine} />
            </View>

            {/* To Wallet */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TRANSFER TO</Text>
              <SelectField
                label=""
                value={toWalletId}
                options={toOptions}
                onChange={setToWalletId}
                placeholder="Select destination wallet"
              />
              {toWallet && (
                <LinearGradient
                  colors={[toWallet.color + '22', toWallet.color + '08']}
                  style={[styles.walletCard, { marginTop: 8 }]}
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

            {/* Amount */}
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

            {/* Date */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DATE</Text>
              <DatePickerField
                label=""
                value={date}
                onChange={setDate}
              />
            </View>

            {/* Note */}
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

            {/* Preview */}
            {!!parseFloat(amount) && toWallet && (
              <View style={styles.preview}>
                <LinearGradient
                  colors={[NEON_BLUE + '12', NEON_BLUE + '04']}
                  style={styles.previewCard}
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
                    <Text style={[styles.previewVal, { color: '#10b981' }]}>
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

            {/* Buttons */}
            <View style={styles.footer}>
              <TouchableOpacity
                onPress={() => router.back()}
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
  safe:           { flex: 1, backgroundColor: COLORS.sheet },
  notFound:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText:   { color: COLORS.textMuted, fontSize: 16 },
  backLink:       { color: NEON_BLUE, fontSize: 14, fontWeight: '600' },
  // Header
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
  backBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  headerCenter:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle:    { color: '#fff', fontWeight: '700', fontSize: 17 },
  transferIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#00D4FF20', alignItems: 'center', justifyContent: 'center' },
  // Body
  body:           { padding: 20, gap: 4 },
  section:        { marginBottom: 20 },
  sectionLabel:   { color: COLORS.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  // Wallet card
  walletCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.lg, padding: 14, ...SHADOW.raised },
  walletDot:      { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  walletInfo:     { flex: 1 },
  walletCardName: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  walletCardBal:  { fontWeight: '600', fontSize: 13, marginTop: 2 },
  walletEmoji:    { fontSize: 22 },
  // Arrow
  arrowRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  arrowLine:      { flex: 1, height: 1, backgroundColor: 'rgba(0,212,255,0.15)' },
  arrowCircle:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginHorizontal: 12 },
  // Preview
  preview:        { marginBottom: 20 },
  previewCard:    { borderRadius: RADIUS.lg, padding: 16, gap: 10, ...SHADOW.raised },
  previewTitle:   { color: NEON_BLUE, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  previewRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewNetRow:  { borderTopWidth: 1, borderTopColor: 'rgba(0,212,255,0.15)', paddingTop: 10, marginTop: 2 },
  previewLabel:   { color: COLORS.textMuted, fontSize: 13 },
  previewVal:     { fontWeight: '700', fontSize: 13 },
  // Footer
  footer:         { flexDirection: 'row', gap: 12 },
  cancelBtn:      { flex: 1, paddingVertical: 14, borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.09)', alignItems: 'center' },
  cancelText:     { color: COLORS.textSlate, fontWeight: '600', fontSize: 15 },
  transferBtn:    { flex: 2 },
});
