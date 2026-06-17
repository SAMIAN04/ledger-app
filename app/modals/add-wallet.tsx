// app/modals/add-wallet.tsx — GlassModal style
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '@/store/useAppStore';
import { useFirestore } from '@/hooks/useFirestore';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { GradientButton } from '@/components/ui/GradientButton';
import { GlassModal } from '@/components/ui/GlassModal';
import { CURRENCIES, WALLET_TYPES } from '@/constants/data';
import { WALLET_COLORS } from '@/constants/walletColors';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';

export default function AddWalletModal() {
  const router = useRouter();
  const { wallets: rawWallets } = useAppStore();
  const { fbAdd } = useFirestore();

  const [name,        setName]        = useState('');
  const [type,        setType]        = useState('cash');
  const [balance,     setBalance]     = useState('');
  const [currency,    setCurrency]    = useState('BDT');
  const [color,       setColor]       = useState('#22c55e');
  const [description, setDescription] = useState('');
  const [logo,        setLogo]        = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);

  const slideY  = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }),
    ]).start();
  }, []);

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.6 });
    if (!result.canceled && result.assets[0].base64) setLogo('data:image/jpeg;base64,' + result.assets[0].base64);
  }

  async function submit() {
    if (!name.trim()) { Alert.alert('Required', 'Wallet name is required.'); return; }
    setLoading(true);
    try {
      await fbAdd('wallets', { name: name.trim(), type, balance: parseFloat(balance) || 0, currency, color, description, logo: logo || null, orderIndex: rawWallets.length });
      router.back();
    } catch { Alert.alert('Error', 'Failed to create wallet.'); }
    finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <GlassModal accentColor={color} secondaryColor="#1e3a5f">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[{ flex: 1 }, { opacity, transform: [{ translateY: slideY }] }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.headerIcon, { backgroundColor: color + '22' }]}>
                <Text style={styles.headerEmoji}>💳</Text>
              </View>
              <Text style={styles.modalTitle}>Add Wallet</Text>
              <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.8}>
                <Ionicons name="close" size={18} color={COLORS.textSlate} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
              <InputField label="Wallet Name" value={name} onChangeText={setName} placeholder="e.g. Bkash, Nagad, DBBL" />

              <View style={styles.field}>
                <Text style={styles.label}>Wallet Logo <Text style={styles.labelNote}>(optional)</Text></Text>
                <TouchableOpacity onPress={pickLogo} style={styles.logoPicker} activeOpacity={0.8}>
                  {logo
                    ? <Image source={{ uri: logo }} style={styles.logoPreview} />
                    : <View style={styles.logoPlaceholder}><Text style={styles.logoPlaceholderIcon}>🖼</Text><Text style={styles.logoPlaceholderText}>Tap to upload logo</Text></View>
                  }
                </TouchableOpacity>
              </View>

              <View style={styles.twoCol}>
                <View style={styles.col}><SelectField label="Type" value={type} options={WALLET_TYPES} onChange={setType} /></View>
                <View style={styles.col}><InputField label="Initial Balance" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="0" /></View>
              </View>

              <SelectField label="Currency" value={currency} options={CURRENCIES} onChange={setCurrency} />

              <View style={styles.field}>
                <Text style={styles.label}>Color</Text>
                <View style={styles.colorRow}>
                  {WALLET_COLORS.map((c) => (
                    <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]} activeOpacity={0.8} />
                  ))}
                </View>
              </View>

              <InputField label="Description (optional)" value={description} onChangeText={setDescription} placeholder="Optional description" />

              <View style={styles.footer}>
                <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn} activeOpacity={0.8}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                <GradientButton label="Add Wallet" onPress={submit} loading={loading} style={styles.submitBtn} />
              </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </GlassModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: COLORS.sheet },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  headerIcon:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerEmoji: { fontSize: 18 },
  modalTitle:  { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1 },
  closeBtn:    { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 10, padding: 8 },
  body:        { padding: 20, paddingBottom: 48 },
  field:       { marginBottom: 16 },
  label:       { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  labelNote:   { textTransform: 'none', fontWeight: '400', color: COLORS.textFaint },
  logoPicker:  { borderRadius: RADIUS.md, padding: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', ...SHADOW.row },
  logoPreview: { width: 64, height: 64, borderRadius: 12 },
  logoPlaceholder:     { alignItems: 'center', gap: 6 },
  logoPlaceholderIcon: { fontSize: 28 },
  logoPlaceholderText: { color: COLORS.textFaint, fontSize: 13 },
  twoCol:      { flexDirection: 'row', gap: 12 },
  col:         { flex: 1 },
  colorRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot:    { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#fff', transform: [{ scale: 1.15 }] },
  footer:      { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn:   { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.10)' },
  cancelText:  { color: COLORS.textSlate, fontWeight: '600', fontSize: 14 },
  submitBtn:   { flex: 1 },
});
