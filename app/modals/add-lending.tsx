// app/modals/add-lending.tsx — GlassModal style
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Animated, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '@/store/useAppStore';
import { useFirestore } from '@/hooks/useFirestore';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GradientButton } from '@/components/ui/GradientButton';
import { GlassModal } from '@/components/ui/GlassModal';
import { WALLET_EMOJI } from '@/constants/data';
import { COLORS, SHADOW } from '@/constants/theme';

export default function AddLendingModal() {
  const router = useRouter();
  const { wallets } = useAppStore();
  const { fbAdd, fbUpdate } = useFirestore();

  const [personName, setPersonName] = useState('');
  const [phone,      setPhone]      = useState('');
  const [amount,     setAmount]     = useState('');
  const [walletId,   setWalletId]   = useState(wallets[0]?.id || '');
  const [dueDate,    setDueDate]    = useState('');
  const [notes,      setNotes]      = useState('');
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [balanceErr, setBalanceErr] = useState(false);
  const [picLoading, setPicLoading] = useState(false);

  const slideY  = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }),
    ]).start();
  }, []);

  const closeModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,  { toValue: 80, duration: 260, useNativeDriver: true }),
    ]).start(() => router.back());
  }, []);

  useEffect(() => {
    const amt = parseFloat(amount);
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet || isNaN(amt) || amt <= 0) { setBalanceErr(false); return; }
    setBalanceErr(amt > (wallet.balance || 0));
  }, [amount, walletId, wallets]);

  const walletOptions  = wallets.map(w => ({ value: w.id, label: `${WALLET_EMOJI[w.type] || '💼'} ${w.name}` }));
  const selectedWallet = wallets.find(w => w.id === walletId);

  // FIX: request base64:true so we store a data URI, not a local file:/// path.
  // Local file:/// paths are ephemeral — they don't survive app restarts or
  // being read from Firestore on a different session. base64 data URIs are
  // self-contained and display correctly everywhere, every time.
  async function pickProfilePic() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
    setPicLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,   // lower quality keeps base64 size manageable
        base64: true,   // ← key fix: get base64 instead of file URI
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setProfilePic('data:image/jpeg;base64,' + result.assets[0].base64);
      }
    } catch { Alert.alert('Error', 'Could not load image.'); }
    finally { setPicLoading(false); }
  }

  async function submit() {
    if (!personName.trim() || !amount) { Alert.alert('Missing fields', 'Person name and amount are required.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { Alert.alert('Invalid amount'); return; }
    if (balanceErr) { Alert.alert('Insufficient Balance', `${selectedWallet?.name} doesn't have enough funds.`); return; }
    setLoading(true);
    try {
      const wallet = wallets.find(w => w.id === walletId);
      const now    = new Date().toISOString();
      const lendingId = await fbAdd('lending', { personName: personName.trim(), phone, amount: amt, walletId, dueDate, status: 'pending', notes, paymentHistory: [], profilePic: profilePic || null, createdAt: now });
      if (wallet) await fbUpdate('wallets', walletId, { balance: (wallet.balance || 0) - amt });
      await fbAdd('transactions', { type: 'lent', title: `Lent to ${personName.trim()}`, amount: amt, walletId, date: now.slice(0, 10), createdAt: now, notes, personName: personName.trim(), phone, profilePic: profilePic || null, linkedRecordId: lendingId });
      closeModal();
    } catch { Alert.alert('Error', 'Failed to save.'); }
    finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <GlassModal accentColor="#3b82f6" secondaryColor="#6366f1">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[{ flex: 1 }, { opacity, transform: [{ translateY: slideY }] }]}>
            <View style={styles.modalHeader}>
              <View style={styles.headerIcon}><Text style={styles.headerEmoji}>🤝</Text></View>
              <Text style={styles.modalTitle}>Record Money Lent</Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeBtn} activeOpacity={0.8}>
                <Ionicons name="close" size={18} color={COLORS.textSlate} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
              <View style={styles.infoBanner}><Text style={styles.infoBannerText}>💡 Recording a lend deducts the amount from your wallet.</Text></View>
              <View style={styles.pfpSection}>
                <TouchableOpacity onPress={pickProfilePic} style={styles.pfpBtn} activeOpacity={0.8} disabled={picLoading}>
                  {profilePic ? <Image source={{ uri: profilePic }} style={styles.pfpImage} /> : <View style={styles.pfpPlaceholder}><Ionicons name="person-add" size={26} color={COLORS.textMuted} /></View>}
                  <View style={styles.pfpBadge}><Ionicons name={picLoading ? 'hourglass' : 'camera'} size={12} color="#fff" /></View>
                </TouchableOpacity>
                <Text style={styles.pfpHint}>Add photo (optional)</Text>
              </View>
              <InputField label="Person Name" value={personName} onChangeText={setPersonName} placeholder="Full name" />
              <InputField label="Phone (optional)" value={phone} onChangeText={setPhone} placeholder="01xxx-xxxxxx" keyboardType="phone-pad" />
              <InputField label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
              {balanceErr && selectedWallet && (
                <View style={styles.balanceAlert}>
                  <Ionicons name="warning" size={18} color="#f97316" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.balanceAlertTitle}>Insufficient Balance</Text>
                    <Text style={styles.balanceAlertBody}>{selectedWallet.name} only has {selectedWallet.currency} {(selectedWallet.balance || 0).toLocaleString()}.</Text>
                  </View>
                </View>
              )}
              <SelectField label="From Wallet" value={walletId} options={walletOptions} onChange={v => { setWalletId(v); setBalanceErr(false); }} />
              <DatePickerField label="Due Date (optional)" value={dueDate} onChange={setDueDate} placeholder="Select due date" disablePast />
              <InputField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Reason for lending..." />
              <View style={styles.footer}>
                <TouchableOpacity onPress={closeModal} style={styles.cancelBtn} activeOpacity={0.8}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                <GradientButton label="Record Lending" onPress={submit} loading={loading} colors={['#3b82f6', '#1d4ed8']} style={styles.submitBtn} disabled={balanceErr} />
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </GlassModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: COLORS.sheet },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16 },
  headerIcon:    { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,130,246,0.22)' },
  headerEmoji:   { fontSize: 18 },
  modalTitle:    { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1 },
  closeBtn:      { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 10, padding: 8 },
  body:          { padding: 20, paddingBottom: 48 },
  infoBanner:    { backgroundColor: 'rgba(59,130,246,0.14)', borderRadius: 12, padding: 12, marginBottom: 20, ...SHADOW.raised },
  infoBannerText:{ color: '#93c5fd', fontSize: 12.5, lineHeight: 18 },
  pfpSection:    { alignItems: 'center', marginBottom: 24 },
  pfpBtn:        { position: 'relative', marginBottom: 8 },
  pfpImage:      { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: 'rgba(59,130,246,0.5)' },
  pfpPlaceholder:{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', ...SHADOW.row },
  pfpBadge:      { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.sheet },
  pfpHint:       { color: COLORS.textMuted, fontSize: 12 },
  balanceAlert:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(249,115,22,0.14)', borderRadius: 12, padding: 12, marginBottom: 16, ...SHADOW.raised },
  balanceAlertTitle: { color: '#fb923c', fontWeight: '700', fontSize: 13, marginBottom: 2 },
  balanceAlertBody:  { color: '#fdba74', fontSize: 12.5, lineHeight: 18 },
  footer:        { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn:     { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.10)' },
  cancelText:    { color: COLORS.textSlate, fontWeight: '600', fontSize: 14 },
  submitBtn:     { flex: 1 },
});