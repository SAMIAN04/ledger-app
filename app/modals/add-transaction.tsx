// app/modals/add-transaction.tsx
//
// Income / Expense  →  unchanged: Firestore-backed, categories, wallet balance update
// Debt / Lent       →  fully rewired to the Financial Profiles system:
//                       debt = borrow transaction  (wallet +, you owe more)
//                       lent = lend  transaction   (wallet -, they owe you more)

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, Animated, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/store/useAppStore';
import { useFirestore } from '@/hooks/useFirestore';
import { useProfiles } from '@/hooks/useProfiles';
import { useProfilesStore } from '@/store/useProfilesStore';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GradientButton } from '@/components/ui/GradientButton';
import { GlassModal } from '@/components/ui/GlassModal';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, CATEGORY_ICONS, WALLET_EMOJI,
} from '@/constants/data';
import { COLORS, RADIUS } from '@/constants/theme';
import { sortWallets } from '@/utils/walletSort';
import { ProfileType, FinancialProfile } from '@/types/profiles';
import { moveTaskToBack, updateWidgetData } from '@/modules/widget-bridge';
import { getCurrencySymbol, convertToPreferred } from '@/lib/currency';

// ─── Types ───────────────────────────────────────────────────────────────────

type TxType = 'income' | 'expense' | 'debt' | 'lent';

const TYPE_BTNS = [
  { key: 'income'  as TxType, label: 'Income',  activeBg: 'rgba(34,197,94,0.18)',  activeColor: '#22c55e', emoji: '📈' },
  { key: 'expense' as TxType, label: 'Expense', activeBg: 'rgba(239,68,68,0.18)',  activeColor: '#ef4444', emoji: '📉' },
  { key: 'debt'    as TxType, label: 'Debt',    activeBg: 'rgba(249,115,22,0.18)', activeColor: '#f97316', emoji: '💸' },
  { key: 'lent'    as TxType, label: 'Lent',    activeBg: 'rgba(99,102,241,0.18)', activeColor: '#818cf8', emoji: '🤝' },
] as const;

const PROFILE_TYPE_OPTIONS: { value: ProfileType; label: string }[] = [
  { value: 'person',   label: '👤 Person'   },
  { value: 'friend',   label: '😊 Friend'   },
  { value: 'family',   label: '🏠 Family'   },
  { value: 'bank',     label: '🏦 Bank'     },
  { value: 'company',  label: '🏢 Company'  },
  { value: 'business', label: '🏪 Business' },
  { value: 'other',    label: '⚬  Other'   },
];

// ─── Animated type button ─────────────────────────────────────────────────────

function AnimTypeBtn({
  item, active, onPress,
}: { item: typeof TYPE_BTNS[number]; active: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: active ? 1.04 : 1, useNativeDriver: true, damping: 14, stiffness: 300,
    }).start();
  }, [active]);

  return (
    <TouchableOpacity
      onPress={() => {
        Animated.sequence([
          Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, damping: 14, stiffness: 400 }),
          Animated.spring(scale, { toValue: active ? 1.04 : 1, useNativeDriver: true, damping: 14, stiffness: 200 }),
        ]).start();
        onPress();
      }}
      activeOpacity={0.85}
      style={{ width: '47%' }}
    >
      <Animated.View style={[
        styles.typeBtn,
        active && { backgroundColor: item.activeBg, borderColor: item.activeColor + '50' },
        { transform: [{ scale }] },
      ]}>
        <Text style={styles.typeBtnEmoji}>{item.emoji}</Text>
        <Text style={[styles.typeBtnText, active && { color: item.activeColor, fontWeight: '800' }]}>
          {item.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Profile Picker ───────────────────────────────────────────────────────────
// Shown when type is debt or lent. Lets user pick an existing profile or
// inline-create a new one with just a name + type.

interface ProfilePickerProps {
  profiles: FinancialProfile[];
  selected: FinancialProfile | null;
  onSelect: (p: FinancialProfile) => void;
  accentColor: string;
  txType: 'debt' | 'lent';
  onCreate: (name: string, type: ProfileType) => Promise<void>;
  creating: boolean;
}

function ProfilePicker({
  profiles, selected, onSelect, accentColor, txType, onCreate, creating,
}: ProfilePickerProps) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ProfileType>('person');

  const filtered = useMemo(
    () => profiles.filter(p => p.name.toLowerCase().includes(query.toLowerCase())),
    [profiles, query],
  );

  // ── If a profile is already selected, show a compact chip ──────────────────
  if (selected) {
    const bal = selected.currentBalance;
    const isOwed = bal < 0;
    const balColor = bal > 0.009 ? '#ef4444' : bal < -0.009 ? '#22c55e' : COLORS.textMuted;
    const balLabel = bal > 0.009 ? 'You Owe' : bal < -0.009 ? 'Owes You' : 'Settled';

    return (
      <View style={[pp.chip, { borderColor: accentColor + '40', backgroundColor: accentColor + '0D' }]}>
        <ProfileAvatar
          uri={selected.profilePic}
          name={selected.name}
          type={selected.type}
          size={40}
          color={accentColor}
          style={pp.chipAvatar}
        />
        <View style={pp.chipMid}>
          <Text style={pp.chipName} numberOfLines={1} ellipsizeMode="tail">{selected.name}</Text>
          <Text style={[pp.chipBal, { color: balColor }]} numberOfLines={1} ellipsizeMode="tail">
            {balLabel}{Math.abs(bal) > 0.009 ? ` · ৳${Math.abs(bal).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => { setQuery(''); setMode('list'); onSelect(null as any); }}
          style={[pp.chipChange, { borderColor: accentColor + '30' }]}
          activeOpacity={0.7}
        >
          <Text style={[pp.chipChangeText, { color: accentColor }]}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Create mode ─────────────────────────────────────────────────────────────
  if (mode === 'create') {
    return (
      <View style={pp.createBox}>
        <View style={pp.createHeader}>
          <TouchableOpacity
            onPress={() => { setMode('list'); setNewName(''); setNewType('person'); }}
            style={pp.backChevron}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={16} color={COLORS.textSlate} />
          </TouchableOpacity>
          <Text style={pp.createTitle}>New Profile</Text>
        </View>
        <TextInput
          style={[pp.searchInput, { borderColor: accentColor + '40' }]}
          value={newName}
          onChangeText={setNewName}
          placeholder="Full name…"
          placeholderTextColor={COLORS.textFaint}
          autoFocus
        />
        <View style={pp.typeRow}>
          {PROFILE_TYPE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[pp.typeChip, newType === opt.value && { backgroundColor: accentColor + '25', borderColor: accentColor + '60' }]}
              onPress={() => setNewType(opt.value)}
              activeOpacity={0.75}
            >
              <Text style={[pp.typeChipText, newType === opt.value && { color: accentColor, fontWeight: '700' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[pp.createBtn, { backgroundColor: accentColor, opacity: (!newName.trim() || creating) ? 0.5 : 1 }]}
          onPress={() => newName.trim() && onCreate(newName.trim(), newType)}
          activeOpacity={0.82}
          disabled={!newName.trim() || creating}
        >
          <Text style={pp.createBtnText}>{creating ? 'Creating…' : 'Create & Select'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── List / search mode ──────────────────────────────────────────────────────
  return (
    <View style={pp.listBox}>
      {/* Search bar */}
      <View style={[pp.searchWrap, { borderColor: accentColor + '30' }]}>
        <Ionicons name="search" size={15} color={COLORS.textFaint} />
        <TextInput
          style={pp.searchInput2}
          value={query}
          onChangeText={setQuery}
          placeholder={txType === 'debt' ? 'Who lent you money?' : 'Who did you lend to?'}
          placeholderTextColor={COLORS.textFaint}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={15} color={COLORS.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {/* Profile rows */}
      {filtered.length > 0 && (
        <View style={pp.rows}>
          {filtered.slice(0, 5).map(p => {
            const bal = p.currentBalance;
            const balColor = bal > 0.009 ? '#ef4444' : bal < -0.009 ? '#22c55e' : COLORS.textFaint;
            const balLabel = bal > 0.009 ? `You owe ৳${Math.abs(bal).toFixed(0)}` : bal < -0.009 ? `Owes you ৳${Math.abs(bal).toFixed(0)}` : 'Settled';
            return (
              <TouchableOpacity
                key={p.id}
                style={pp.profileRow}
                onPress={() => onSelect(p)}
                activeOpacity={0.75}
              >
                <ProfileAvatar
                  uri={p.profilePic}
                  name={p.name}
                  type={p.type}
                  size={36}
                  color={accentColor}
                  textColor={COLORS.text}
                  fallback="initials"
                />
                <View style={{ flex: 1 }}>
                  <Text style={pp.rowName}>{p.name}</Text>
                  <Text style={[pp.rowBal, { color: balColor }]}>{balLabel}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={COLORS.textFaint} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <View style={pp.emptyRow}>
          <Text style={pp.emptyText}>
            {query ? `No profiles match "${query}"` : 'No profiles yet'}
          </Text>
        </View>
      )}

      {/* Create new */}
      <TouchableOpacity
        style={[pp.newProfileBtn, { borderColor: accentColor + '35' }]}
        onPress={() => { setMode('create'); setNewName(query); }}
        activeOpacity={0.78}
      >
        <View style={[pp.newProfileIcon, { backgroundColor: accentColor + '20' }]}>
          <Ionicons name="person-add" size={14} color={accentColor} />
        </View>
        <Text style={[pp.newProfileText, { color: accentColor }]}>
          {query ? `Create "${query}"` : 'New Profile'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Profile Picker styles ────────────────────────────────────────────────────
const pp = StyleSheet.create({
  // selected chip
  chip: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: RADIUS.md, padding: 12, marginBottom: 4, overflow: 'hidden' },
  chipAvatar: { flexShrink: 0 },
  chipMid: { flex: 1, minWidth: 0 },
  chipName: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  chipBal: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  chipChange: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  chipChangeText: { fontSize: 12, fontWeight: '700' },

  // create mode
  createBox: { gap: 12 },
  createHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  backChevron: { padding: 4 },
  createTitle: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  typeChipText: { color: COLORS.textSlate, fontSize: 11.5, fontWeight: '600' },
  createBtn: { borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // list / search mode
  listBox: { gap: 10 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1,
    borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1,
    borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 11,
    color: COLORS.text, fontSize: 14,
  },
  searchInput2: { flex: 1, color: COLORS.text, fontSize: 13, paddingVertical: 0 },
  rows: { gap: 2 },
  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  rowName: { color: COLORS.text, fontWeight: '600', fontSize: 13 },
  rowBal: { fontSize: 11, marginTop: 1 },
  emptyRow: { paddingVertical: 12, alignItems: 'center' },
  emptyText: { color: COLORS.textFaint, fontSize: 12 },
  newProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    borderRadius: RADIUS.md, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  newProfileIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  newProfileText: { fontWeight: '700', fontSize: 13 },
});

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function AddTransactionModal() {
  const router = useRouter();
  const { wallets: rawWallets, addTxType, setAddTxType } = useAppStore();
  const wallets = useMemo(() => sortWallets(rawWallets), [rawWallets]);
  const { fbAdd, fbUpdate } = useFirestore();
  const { createProfile, addProfileTransaction } = useProfiles();
  const { profiles } = useProfilesStore();

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [type,     setType]     = useState<TxType>(addTxType);
  const [amount,   setAmount]   = useState('');
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [notes,    setNotes]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // ── Income / Expense only ─────────────────────────────────────────────────
  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState('Food');

  // ── Debt / Lent only (new profile system) ─────────────────────────────────
  const [selectedProfile, setSelectedProfile] = useState<FinancialProfile | null>(null);
  const [creating,        setCreating]        = useState(false);

  // ── Animation ─────────────────────────────────────────────────────────────
  const slideY  = useRef(new Animated.Value(60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 180 }),
    ]).start();
  }, []);

  // If this session started from a home-screen-widget tap, recede the app
  // to the background once this modal goes away — covers every dismiss
  // path (Save, Cancel, the X button, swipe-to-dismiss, Android hardware
  // back) since they all unmount this screen. The user should only ever
  // see the widget + this modal, never the app itself.
  useEffect(() => {
    return () => {
      if (useAppStore.getState().launchedFromWidget) {
        useAppStore.getState().setLaunchedFromWidget(false);
        moveTaskToBack();
      }
    };
  }, []);

  const closeModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 80, duration: 260, useNativeDriver: true }),
    ]).start(() => {
      // A widget-driven cold start can leave this modal as the only entry
      // in the stack — fall back to Home instead of a no-op back().
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/home');
    });
  }, []);

  // ── Immediate widget sync (widget-launched sessions only) ─────────────────
  // When this modal was opened from the home-screen widget (+/−), we call
  // updateWidgetData() directly right after saving, bypassing the 400ms
  // debounce in useWidgetSync. This guarantees the widget balance is correct
  // the instant the user returns to their home screen — before moveTaskToBack()
  // fires on modal unmount.
  async function syncWidgetIfNeeded() {
    if (!useAppStore.getState().launchedFromWidget) return;
    try {
      const store = useAppStore.getState();
      const fresh = sortWallets(store.wallets);
      const pref  = store.preferredCurrency || 'BDT';
      const sym   = getCurrencySymbol(pref);
      const fmt   = (n: number) =>
        Number(n.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
      const total = fresh.reduce(
        (s, w) => s + convertToPreferred(w.balance || 0, w.currency || 'BDT', pref),
        0,
      );
      await updateWidgetData(
        'Total Balance',
        `${sym}\u00A0${fmt(total)}`,
        fresh.map(w => ({
          id:      w.id,
          name:    w.name || 'Wallet',
          balance: `${sym}\u00A0${fmt(
            convertToPreferred(w.balance || 0, w.currency || 'BDT', pref),
          )}`,
        })),
      );
    } catch (_) { /* non-fatal */ }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const isDebtLent     = type === 'debt' || type === 'lent';
  const activeType     = TYPE_BTNS.find(b => b.key === type)!;
  const selectedWallet = wallets.find(w => w.id === walletId);
  const cats           = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const walletOptions  = wallets.map(w => ({ value: w.id, label: `${WALLET_EMOJI[w.type] || '💼'} ${w.name}` }));
  const catOptions     = cats.map(c => ({ value: c, label: `${CATEGORY_ICONS[c] || ''} ${c}` }));

  const amt = parseFloat(amount);
  const balanceErr = (type === 'expense' || type === 'lent') && !isNaN(amt) && amt > 0 && selectedWallet
    ? amt > (selectedWallet.balance || 0)
    : false;

  function changeType(t: TxType) {
    setType(t);
    setAddTxType(t);
    setCategory(t === 'income' ? 'Salary' : 'Food');
    setSelectedProfile(null);
  }

  // ── Quick-create profile and auto-select it ───────────────────────────────
  async function handleCreateProfile(name: string, profileType: ProfileType) {
    setCreating(true);
    try {
      const id = await createProfile({
        name,
        type: profileType,
        interestType: 'none',
      });
      // find the freshly created profile in store
      const fresh = useProfilesStore.getState().profiles.find(p => p.id === id);
      if (fresh) setSelectedProfile(fresh);
    } catch {
      Alert.alert('Error', 'Could not create profile.');
    } finally {
      setCreating(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    if (isDebtLent) {
      // ── Debt / Lent path: Financial Profiles system ───────────────────────
      if (!selectedProfile) {
        Alert.alert('Select a profile', 'Please choose or create a contact first.');
        return;
      }
      if (isNaN(amt) || amt <= 0) {
        Alert.alert('Invalid amount', 'Please enter a valid amount.');
        return;
      }
      if (!walletId) {
        Alert.alert('Select wallet', 'Please choose a wallet.');
        return;
      }

      setLoading(true);
      try {
        // debt (I borrowed) → 'borrow' in profiles system
        // lent (I lent out) → 'lend'  in profiles system
        await addProfileTransaction({
          profileId: selectedProfile.id,
          type:      type === 'debt' ? 'borrow' : 'lend',
          amount:    amt,
          walletId,
          note:      notes.trim() || undefined,
        });

        // NOTE: addProfileTransaction() already mirrors a transaction to the
        // main transactions table (step 4 in useProfiles.ts). Do NOT add a
        // second fbAdd('transactions') here — that was the cause of the double
        // entry bug.

        await syncWidgetIfNeeded();
        closeModal();
      } catch {
        Alert.alert('Error', 'Failed to save transaction.');
      } finally {
        setLoading(false);
      }
    } else {
      // ── Income / Expense path: unchanged original logic ───────────────────
      if (!title.trim() || !amount || !walletId) {
        Alert.alert('Missing fields', 'Please fill title, amount and wallet.');
        return;
      }
      if (isNaN(amt) || amt <= 0) {
        Alert.alert('Invalid amount', 'Please enter a valid amount.');
        return;
      }
      const wallet = wallets.find(w => w.id === walletId);
      if (type === 'expense' && wallet && amt > (wallet.balance || 0)) {
        Alert.alert('Insufficient balance', `${wallet.name} only has ${wallet.currency} ${(wallet.balance || 0).toLocaleString()}.`);
        return;
      }

      setLoading(true);
      try {
        const now = new Date().toISOString();
        const newBal = type === 'income'
          ? (wallet?.balance || 0) + amt
          : (wallet?.balance || 0) - amt;
        if (wallet) await fbUpdate('wallets', walletId, { balance: newBal });
        await fbAdd('transactions', {
          type, title: title.trim(), amount: amt, walletId,
          category, date, createdAt: now, notes,
        });
        await syncWidgetIfNeeded();
        closeModal();
      } catch {
        Alert.alert('Error', 'Failed to save transaction.');
      } finally {
        setLoading(false);
      }
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <GlassModal accentColor={activeType.activeColor} secondaryColor="#1e293b">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[{ flex: 1 }, { opacity, transform: [{ translateY: slideY }] }]}>

            {/* ── Header */}
            <View style={styles.modalHeader}>
              <View style={[styles.headerIcon, { backgroundColor: activeType.activeColor + '22', borderColor: activeType.activeColor + '40' }]}>
                <Text style={styles.headerEmoji}>{activeType.emoji}</Text>
              </View>
              <Text style={styles.modalTitle}>Add Transaction</Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeBtn} activeOpacity={0.8}>
                <Ionicons name="close" size={18} color={COLORS.textSlate} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
            >
              {/* ── Type selector */}
              <View style={styles.typeGrid}>
                {TYPE_BTNS.map(b => (
                  <AnimTypeBtn key={b.key} item={b} active={type === b.key} onPress={() => changeType(b.key)} />
                ))}
              </View>

              {/* ════════════════════════════════════════════════════════════
                  DEBT / LENT — Financial Profiles flow
              ════════════════════════════════════════════════════════════ */}
              {isDebtLent && (
                <>
                  {/* Info banner */}
                  <View style={[
                    styles.infoBanner,
                    type === 'debt'
                      ? { backgroundColor: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.25)' }
                      : { backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)' },
                  ]}>
                    <Ionicons
                      name={type === 'debt' ? 'arrow-down-circle' : 'arrow-up-circle'}
                      size={14}
                      color={type === 'debt' ? '#fdba74' : '#a5b4fc'}
                    />
                    <Text style={[
                      styles.infoBannerText,
                      { color: type === 'debt' ? '#fdba74' : '#a5b4fc', flex: 1 },
                    ]}>
                      {type === 'debt'
                        ? 'Borrow — money added to wallet, balance tracked under the profile'
                        : 'Lend — money deducted from wallet, balance tracked under the profile'}
                    </Text>
                  </View>

                  {/* Section label */}
                  <Text style={styles.sectionLabel}>
                    {type === 'debt' ? 'Borrowed From' : 'Lent To'}
                  </Text>

                  {/* Profile picker */}
                  <ProfilePicker
                    profiles={profiles}
                    selected={selectedProfile}
                    onSelect={setSelectedProfile}
                    accentColor={activeType.activeColor}
                    txType={type}
                    onCreate={handleCreateProfile}
                    creating={creating}
                  />

                  <View style={styles.divider} />

                  {/* Amount */}
                  <InputField
                    label="Amount"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />

                  {/* Balance warning for lent */}
                  {balanceErr && selectedWallet && (
                    <View style={styles.balanceAlert}>
                      <Ionicons name="warning" size={16} color="#f97316" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.balanceAlertTitle}>Insufficient Balance</Text>
                        <Text style={styles.balanceAlertBody}>
                          {selectedWallet.name} only has {selectedWallet.currency} {(selectedWallet.balance || 0).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Wallet */}
                  <SelectField
                    label="Wallet"
                    value={walletId}
                    options={walletOptions}
                    onChange={setWalletId}
                  />

                  {/* Note */}
                  <InputField
                    label="Note (optional)"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Add a note…"
                  />
                </>
              )}

              {/* ════════════════════════════════════════════════════════════
                  INCOME / EXPENSE — original flow, unchanged
              ════════════════════════════════════════════════════════════ */}
              {!isDebtLent && (
                <>
                  {/* Info banners */}
                  {type === 'income' && (
                    <View style={[styles.infoBanner, { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)' }]}>
                      <Text style={[styles.infoBannerText, { color: '#86efac' }]}>💡 Income adds money to the selected wallet.</Text>
                    </View>
                  )}
                  {type === 'expense' && (
                    <View style={[styles.infoBanner, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }]}>
                      <Text style={[styles.infoBannerText, { color: '#fca5a5' }]}>⚠️ Expense deducts money from the selected wallet.</Text>
                    </View>
                  )}

                  <InputField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Monthly Salary" />
                  <InputField
                    label="Amount"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />

                  {/* Balance error for expense */}
                  {balanceErr && selectedWallet && (
                    <View style={styles.balanceAlert}>
                      <Ionicons name="warning" size={16} color="#f97316" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.balanceAlertTitle}>Insufficient Balance</Text>
                        <Text style={styles.balanceAlertBody}>
                          {selectedWallet.name} only has {selectedWallet.currency} {(selectedWallet.balance || 0).toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.twoCol}>
                    <View style={styles.col}>
                      <SelectField label="Wallet" value={walletId} options={walletOptions} onChange={v => { setWalletId(v); }} />
                    </View>
                    <View style={styles.col}>
                      <SelectField label="Category" value={category} options={catOptions} onChange={setCategory} />
                    </View>
                  </View>

                  <DatePickerField label="Date" value={date} onChange={setDate} placeholder="Select date" />
                  <InputField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Add a note…" />
                </>
              )}

              {/* ── Footer buttons */}
              <View style={styles.footer}>
                <TouchableOpacity onPress={closeModal} style={styles.cancelBtn} activeOpacity={0.8}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <GradientButton
                  label={loading ? 'Saving…' : (isDebtLent ? (type === 'debt' ? 'Record Debt' : 'Record Lent') : 'Add Transaction')}
                  onPress={submit}
                  loading={loading}
                  style={styles.submitBtn}
                  disabled={balanceErr || loading || creating}
                />
              </View>

            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </GlassModal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'rgba(13,18,32,0.99)' },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerEmoji: { fontSize: 18 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1 },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
    padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },

  body: { padding: 20, paddingBottom: 48, gap: 14 },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeBtn: {
    paddingVertical: 10, borderRadius: 14, alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', justifyContent: 'center',
  },
  typeBtnEmoji: { fontSize: 18 },
  typeBtnText:  { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderWidth: 1, borderRadius: 12, padding: 12,
  },
  infoBannerText: { fontSize: 12.5, lineHeight: 18 },

  sectionLabel: {
    color: COLORS.textSlate, fontSize: 11.5, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

  balanceAlert: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.35)', borderRadius: 12, padding: 12,
  },
  balanceAlertTitle: { color: '#fb923c', fontWeight: '700', fontSize: 13, marginBottom: 2 },
  balanceAlertBody:  { color: '#fdba74', fontSize: 12.5, lineHeight: 18 },

  twoCol: { flexDirection: 'row', gap: 12 },
  col:    { flex: 1 },

  footer:    { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelText: { color: COLORS.textSlate, fontWeight: '600', fontSize: 14 },
  submitBtn:  { flex: 1 },
});
