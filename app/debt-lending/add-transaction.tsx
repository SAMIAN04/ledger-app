// app/debt-lending/add-transaction.tsx — Add Profile Transaction Modal
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useProfiles } from '@/hooks/useProfiles';
import { useProfilesStore } from '@/store/useProfilesStore';
import { useAppStore } from '@/store/useAppStore';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { GradientButton } from '@/components/ui/GradientButton';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { COLORS, RADIUS, SPACING, FONT, SHADOW } from '@/constants/theme';
import { ProfileTransactionType } from '@/types/profiles';
import { WALLET_EMOJI } from '@/constants/data';

const TX_META: Record<ProfileTransactionType, { label: string; desc: string; color: string; icon: string; needsWallet: boolean }> = {
  borrow:     { label: 'Borrow Money',    desc: 'Money received — wallet goes up, you owe more',       color: '#f97316', icon: 'arrow-down-circle', needsWallet: true },
  lend:       { label: 'Lend Money',      desc: 'Money given — wallet goes down, they owe you more',   color: '#3b82f6', icon: 'arrow-up-circle',   needsWallet: true },
  repay:      { label: 'Repay Debt',      desc: 'You pay back — wallet goes down, debt reduced',       color: '#ef4444', icon: 'checkmark-circle',  needsWallet: true },
  receive:    { label: 'Receive Payment', desc: 'They pay back — wallet goes up, credit reduced',      color: '#10b981', icon: 'arrow-down-circle', needsWallet: true },
  adjustment: { label: 'Adjustment',      desc: 'Manual balance correction — no wallet change',        color: '#f59e0b', icon: 'options',           needsWallet: false },
  interest:   { label: 'Interest',        desc: 'Interest charged — adds to what you owe',             color: '#f97316', icon: 'trending-up',       needsWallet: false },
  fee:        { label: 'Fee',             desc: 'Fee charged — adds to what you owe',                  color: '#94a3b8', icon: 'receipt',           needsWallet: false },
};

// All options — will be filtered at runtime based on profile status.
const ALL_TX_TYPE_OPTIONS = [
  { value: 'lend',       label: '↑ Lend Money',        forOwesYou: true,  forYouOwe: false },
  { value: 'receive',    label: '↓ Receive Payment',   forOwesYou: true,  forYouOwe: false },
  { value: 'borrow',     label: '↓ Borrow Money',      forOwesYou: false, forYouOwe: true  },
  { value: 'repay',      label: '✓ Repay Debt',        forOwesYou: false, forYouOwe: true  },
  { value: 'adjustment', label: '⚙ Adjustment',        forOwesYou: true,  forYouOwe: true  },
  { value: 'interest',   label: '% Interest',          forOwesYou: false, forYouOwe: true  },
  { value: 'fee',        label: '📄 Fee',              forOwesYou: false, forYouOwe: true  },
];

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileId: string; txType?: string }>();
  const profileId = params.profileId;

  const { profiles } = useProfilesStore();
  const { addProfileTransaction } = useProfiles();
  const { wallets, preferredCurrency } = useAppStore();

  const profile = profiles.find(p => p.id === profileId);

  // Derive a sensible default type from the passed param or profile status
  function defaultTxType(): ProfileTransactionType {
    if (params.txType) return params.txType as ProfileTransactionType;
    const bal = profile?.currentBalance ?? 0;
    if (bal > 0.009)  return 'repay';   // you_owe → most likely next action is repay
    if (bal < -0.009) return 'lend';    // owes_you → most likely next action is receive... but lend is the base
    return 'adjustment';
  }

  const [txType, setTxType] = useState<ProfileTransactionType>(defaultTxType);
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const slideY  = useRef(new Animated.Value(50)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 160 }),
    ]).start();
  }, []);

  const meta = TX_META[txType];
  const walletOptions = wallets.map(w => ({ value: w.id, label: `${WALLET_EMOJI[w.type] || '💼'} ${w.name}` }));

  // Derive profile status to filter action options
  const profileBalance = profile?.currentBalance ?? 0;
  const profileStatus = profileBalance > 0.009 ? 'you_owe' : profileBalance < -0.009 ? 'owes_you' : 'settled';
  const txTypeOptions = ALL_TX_TYPE_OPTIONS.filter(o => {
    if (profileStatus === 'settled')  return o.value === 'adjustment';
    if (profileStatus === 'owes_you') return o.forOwesYou;
    if (profileStatus === 'you_owe')  return o.forYouOwe;
    return true;
  });

  // Balance warning for outgoing transactions
  const selectedWallet = wallets.find(w => w.id === walletId);
  const amt = parseFloat(amount);
  const showBalanceWarning =
    meta.needsWallet &&
    (txType === 'lend' || txType === 'repay') &&
    !isNaN(amt) && amt > 0 &&
    selectedWallet &&
    amt > (selectedWallet.balance || 0);

  async function submit() {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid positive amount.');
      return;
    }
    if (meta.needsWallet && !walletId) {
      Alert.alert('Wallet required', 'Please select a wallet.');
      return;
    }

    setLoading(true);
    try {
      await addProfileTransaction({
        profileId,
        type: txType,
        amount: parseFloat(amount),
        walletId: meta.needsWallet ? walletId : undefined,
        note: note.trim() || undefined,
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save transaction.');
    } finally {
      setLoading(false);
    }
  }

  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 20 }}>
          <Text style={{ color: COLORS.primary }}>← Go Back</Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>Profile not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={['#030712', '#060d1a']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ProfileAvatar
            uri={profile.profilePic}
            name={profile.name}
            type={profile.type}
            size={28}
            color={COLORS.primary}
            style={styles.headerAvatar}
          />
          <View>
            <Text style={styles.headerTitle}>New Transaction</Text>
            <Text style={styles.headerSub}>{profile.name}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.ScrollView
          style={{ opacity, transform: [{ translateY: slideY }] }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Type Selector */}
          <SelectField
            label="Transaction Type"
            value={txType}
            options={txTypeOptions}
            onChange={(v) => setTxType(v as ProfileTransactionType)}
          />

          {/* Description */}
          <View style={[styles.descCardShadow, { backgroundColor: meta.color + '12' }]}>
            <View style={styles.descCard}>
              <LinearGradient
                colors={[meta.color + '15', meta.color + '05']}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name={meta.icon as any} size={20} color={meta.color} />
              <View>
                <Text style={[styles.descTitle, { color: meta.color }]}>{meta.label}</Text>
                <Text style={styles.descText}>{meta.desc}</Text>
              </View>
            </View>
          </View>

          {/* Amount */}
          <InputField
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          {/* Wallet Selector */}
          {meta.needsWallet && (
            <SelectField
              label="Wallet"
              value={walletId}
              options={walletOptions}
              onChange={setWalletId}
            />
          )}

          {/* Balance Warning */}
          {showBalanceWarning && (
            <View style={styles.warning}>
              <Ionicons name="warning" size={14} color="#f59e0b" />
              <Text style={styles.warningText}>
                Amount exceeds wallet balance ({selectedWallet?.balance?.toFixed(2)})
              </Text>
            </View>
          )}

          {/* Note */}
          <InputField
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="Add a note…"
            multiline
            numberOfLines={2}
          />

          <GradientButton
            label={loading ? 'Saving…' : `Save ${meta.label}`}
            onPress={submit}
            disabled={loading || !amount}
            colors={[meta.color, meta.color + 'cc']}
          />

          <View style={{ height: 40 }} />
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#030712' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700', textAlign: 'center' },
  headerSub: { color: COLORS.textMuted, fontSize: FONT.sm, textAlign: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { flexShrink: 0 },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.sm },

  descCardShadow: {
    borderRadius: RADIUS.md,
    ...SHADOW.raised,
  },
  descCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderRadius: RADIUS.md, padding: SPACING.md,
    overflow: 'hidden',
  },
  descTitle: { fontSize: FONT.sm, fontWeight: '700', marginBottom: 2 },
  descText: { color: COLORS.textSlate, fontSize: FONT.xs, lineHeight: 16 },

  warning: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderRadius: RADIUS.sm,
    padding: SPACING.sm, paddingHorizontal: SPACING.md,
    ...SHADOW.raised,
  },
  warningText: { color: '#f59e0b', fontSize: FONT.xs, flex: 1 },
});
