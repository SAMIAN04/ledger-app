// app/(tabs)/profile.tsx — Profile only (Debt/Lending moved to Home)
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, Alert, Modal, Linking,
  Pressable, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAppStore } from '@/store/useAppStore';
import { useProfilesStore } from '@/store/useProfilesStore';
import { clearAllUserData } from '@/lib/database';
import { flushSyncQueueForSignOut } from '@/hooks/useSyncEngine';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { GradientButton } from '@/components/ui/GradientButton';
import { CURRENCIES } from '@/constants/data';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';
import { useRouter } from 'expo-router';

// ─── Developer info — edit these ───────────────────────────────────────────
const DEV = {
  name: 'Samian sikdar',                        // e.g. 'Rafiq Islam'
  title: 'Founder & Developer',                   // e.g. 'Full-stack developer'
  // Replace with require('../assets/your-photo.jpg') for a local image,
  // or keep as a URL string for a remote one:
  // photo: require("../../assets/dev.jpg"), // e.g. 'https://example.com/photo.jpg' or null
  initials: 'YN',                           // shown when photo is null
  contacts: [
    { icon: 'mail-outline',     label: 'Email',    value: 'samiansikdar04@gmail.com',          action: 'samiansikdar04@gmail.com' },
    { icon: 'logo-github',      label: 'GitHub',   value: 'github.com/samian04',    action: 'https://github.com/samian04' },
    { icon: 'logo-linkedin',    label: 'LinkedIn', value: 'linkedin.com/in/samian-sikdar', action: 'https://linkedin.com/in/samian-sikdar' },
    { icon: 'call-outline',     label: 'Phone',    value: '+880 1329483669',         action: 'tel:+8801329483669' },
  ],
};
// ───────────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { user, preferredCurrency, setUser, setPreferredCurrency, uid } = useAppStore();

  const [editName, setEditName] = useState(user.name || '');
  const [saving, setSaving] = useState(false);
  const [devModalVisible, setDevModalVisible] = useState(false);
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);

  // Spinner for the "Syncing… please wait" sign-out popup — only animates
  // while the popup is actually visible.
  const signOutSpin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!signOutModalVisible) return;
    signOutSpin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(signOutSpin, { toValue: 1, duration: 800, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [signOutModalVisible]); // eslint-disable-line react-hooks/exhaustive-deps
  const signOutSpinRotate = signOutSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const initials = (user.name || 'U')[0].toUpperCase();

  async function pickProfilePic() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true, quality: 0.6, allowsEditing: true, aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0].base64) {
      const pic = 'data:image/jpeg;base64,' + result.assets[0].base64;
      setUser({ ...user, profilePic: pic });
      if (uid) {
        try { await updateDoc(doc(db, 'users', uid), { profilePic: pic }); } catch {}
      }
    }
  }

  async function saveName() {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      setUser({ ...user, name: editName.trim() });
      if (uid) await updateDoc(doc(db, 'users', uid), { name: editName.trim() });
    } catch {
      Alert.alert('Error', 'Failed to save name.');
    } finally { setSaving(false); }
  }

  async function saveCurrency(c: string) {
    if (!c || typeof c !== 'string') return;
    setPreferredCurrency(c);
    if (uid) {
      try { await updateDoc(doc(db, 'users', uid), { preferredCurrency: c }); } catch {}
    }
  }

  async function doSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => attemptSignOut(false) },
    ]);
  }

  // force=true means the user has already been warned about unsynced data
  // and explicitly chose to proceed anyway.
  async function attemptSignOut(force: boolean) {
    const currentUid = useAppStore.getState().uid;

    // ── Step 0: Refuse to even attempt sign-out while offline ──────────────
    // clearAllUserData() (below) deletes the sync_queue table. Offline, there
    // is no way to confirm pending writes have actually reached Firestore —
    // so unlike the "some changes haven't synced" case, there is no safe
    // "Sign Out Anyway" override here. The user must reconnect first.
    const netState = await NetInfo.fetch().catch(() => null);
    const isOnline = !!(netState?.isConnected && netState?.isInternetReachable);
    if (!isOnline) {
      Alert.alert(
        "You're Offline",
        'Signing out requires an internet connection so any unsynced changes can be backed up first. Please reconnect and try again.',
      );
      return;
    }

    // ── Step 1: Flush pending offline writes to Firestore, then verify ─────
    // CRITICAL: clearAllUserData() deletes the sync_queue, so this is the
    // only chance to get unsynced writes off the device. We don't trust the
    // flush's own bookkeeping — fullySynced reflects a fresh DB re-check
    // taken right after the attempt, so it's correct regardless of *why*
    // the flush did or didn't fully complete (offline, slow network,
    // timeout, partial failures).
    let fullySynced = true;
    let remaining = 0;
    if (currentUid) {
      setSignOutModalVisible(true);
      useAppStore.getState().setSyncStatus('syncing', 'Syncing before sign out…');
      try {
        const result = await flushSyncQueueForSignOut(currentUid, 15000);
        fullySynced = result.fullySynced;
        remaining = result.remaining;
      } catch (e) {
        console.warn('[signout] pre-signout flush error:', e);
        fullySynced = false;
      }
      setSignOutModalVisible(false);
    }

    // ── Safety gate ──────────────────────────────────────────────────────
    // Refuse to destroy local data unless sync is CONFIRMED complete, unless
    // the user has explicitly accepted the risk after being told.
    if (!fullySynced && !force) {
      useAppStore.getState().setSyncStatus('failed', 'Unsynced changes');
      Alert.alert(
        "Some changes haven't synced yet",
        `${remaining} change${remaining === 1 ? '' : 's'} could not be confirmed as backed up — this can happen if you're offline or your connection is slow right now. Signing out anyway could lose ${remaining === 1 ? 'it' : 'them'} permanently.`,
        [
          { text: 'Stay Signed In', style: 'cancel' },
          { text: 'Sign Out Anyway', style: 'destructive', onPress: () => attemptSignOut(true) },
        ],
      );
      return;
    }

    // ── Step 2: Wipe local SQLite data ──────────────────────────────────
    try { await clearAllUserData(); } catch (e) {
      console.warn('[signout] clearAllUserData error:', e);
    }

    // ── Step 3: Reset Zustand state ─────────────────────────────────────
    useAppStore.setState({
      wallets: [], transactions: [], lending: [], debts: [],
      uid: null,
      user: { name: '', email: '', profilePic: null, preferredCurrency: 'BDT' },
      authReady: false,
    });
    useProfilesStore.setState({ profiles: [] });

    // ── Step 4: Sign out of Firebase ────────────────────────────────────
    // onAuthStateChanged in _layout.tsx will fire next and handle routing.
    await signOut(auth);
  }



  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Profile</Text>

        {/* Profile card */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={pickProfilePic} style={styles.avatarWrap} activeOpacity={0.8}>
              {user.profilePic ? (
                <Image source={{ uri: user.profilePic }} style={styles.avatar} />
              ) : (
                <LinearGradient colors={['#10b981', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{initials}</Text>
                </LinearGradient>
              )}
              <View style={styles.avatarBadge}>
                <Ionicons name="pencil" size={10} color="#fff" />
              </View>
            </TouchableOpacity>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name || 'User'}</Text>
              <Text style={styles.userEmail}>{user.email}</Text>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active</Text>
              </View>
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <InputField label="Display Name" value={editName} onChangeText={setEditName} placeholder="Your name" />
            </View>
            <View style={styles.col}>
              <InputField label="Email" value={user.email || ''} editable={false} style={styles.disabledInput} placeholder="email" />
            </View>
          </View>
          <SelectField label="Total Balance Currency" value={preferredCurrency} options={CURRENCIES} onChange={saveCurrency} />
          <GradientButton label="Save Changes" onPress={saveName} loading={saving} />
        </View>

        {/* Developer Contact */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Developer contact</Text>
          <TouchableOpacity style={styles.devRow} onPress={() => setDevModalVisible(true)} activeOpacity={0.8}>
            <View style={styles.devAvatarWrap}>
             <Image
  source={require('../../assets/dev.jpg')}
  style={styles.devAvatar}
/>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.devName}>{DEV.name}</Text>
              <Text style={styles.devTitle}>{DEV.title}</Text>
            </View>
            <View style={styles.devChevronWrap}>
              <Ionicons name="information-circle-outline" size={20} color="#8b5cf6" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Account */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <TouchableOpacity style={styles.signOutRow} onPress={doSignOut} activeOpacity={0.8}>
            <View style={styles.signOutIcon}>
              <Ionicons name="log-out-outline" size={16} color="#ef4444" />
            </View>
            <Text style={styles.signOutText}>Sign Out</Text>
            <Text style={styles.signOutChevron}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Developer Contact Modal ── */}
      <Modal
        visible={devModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDevModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDevModalVisible(false)}>
          {/* Stop inner tap from closing */}
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>

            {/* Drag handle */}
            <View style={styles.dragHandle} />

            {/* Close button */}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setDevModalVisible(false)} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            {/* Dev avatar */}
            <View style={styles.modalAvatarWrap}>
              <Image
  source={require('../../assets/dev.jpg')}
  style={styles.modalAvatar}
/>
              {/* Purple ring */}
              <View style={styles.modalAvatarRing} />
            </View>

            <Text style={styles.modalDevName}>{DEV.name}</Text>
            <Text style={styles.modalDevTitle}>{DEV.title}</Text>

            {/* Built with badge */}
            <View style={styles.builtBadge}>
              <Ionicons name="code-slash-outline" size={13} color="#8b5cf6" />
              <Text style={styles.builtText}>Built this app with ❤️</Text>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Contact links */}
            <Text style={styles.contactHeading}>Get in touch</Text>
            {DEV.contacts.map((c, i) => (
              <TouchableOpacity
                key={i}
                style={styles.contactRow}
                onPress={() => Linking.openURL(c.action).catch(() => Alert.alert('Error', `Could not open ${c.label}`))}
                activeOpacity={0.75}
              >
                <View style={styles.contactIcon}>
                  <Ionicons name={c.icon as any} size={17} color="#8b5cf6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>{c.label}</Text>
                  <Text style={styles.contactValue}>{c.value}</Text>
                </View>
                <Ionicons name="open-outline" size={14} color={COLORS.textFaint} />
              </TouchableOpacity>
            ))}

            <View style={{ height: 24 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Sign-out syncing popup — blocks interaction while we flush ── */}
      <Modal
        visible={signOutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.syncOverlay}>
          <View style={styles.syncCard}>
            <Animated.View style={[styles.syncSpinner, { transform: [{ rotate: signOutSpinRotate }] }]} />
            <Text style={styles.syncTitle}>Syncing your changes…</Text>
            <Text style={styles.syncSubtitle}>Please wait a moment before signing out.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 16, paddingBottom: 20 },
  pageTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5, paddingTop: 12, marginBottom: 20 },
  card: { backgroundColor: COLORS.cardElevated, borderRadius: RADIUS.xxl, padding: 20, marginBottom: 16, ...SHADOW.card },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 16 },

  // Profile
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(16,185,129,0.3)', overflow: 'hidden' },
  avatarInitial: { color: '#fff', fontSize: 28, fontWeight: '800' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#10b981', borderWidth: 2, borderColor: COLORS.cardElevated, alignItems: 'center', justifyContent: 'center' },
  userInfo: { flex: 1 },
  userName: { color: '#fff', fontWeight: '900', fontSize: 19, marginBottom: 2 },
  userEmail: { color: COLORS.textMuted, fontSize: 14, marginBottom: 6 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  activeText: { color: '#10b981', fontSize: 11, fontWeight: '700' },
  twoCol: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  disabledInput: { opacity: 0.5 },

  // Developer row (card)
  devRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: 'rgba(139,92,246,0.10)', borderRadius: RADIUS.xl },
  devAvatarWrap: { borderRadius: 24, overflow: 'hidden' },
  devAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  devAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  devName: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  devTitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  devChevronWrap: { padding: 4 },

  // Sign out
  signOutRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: RADIUS.xl },
  signOutIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.18)', alignItems: 'center', justifyContent: 'center' },
  signOutText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14, flex: 1 },
  signOutChevron: { color: '#ef4444', fontSize: 20 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 14,
    ...SHADOW.sheet,
  },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 12 },
  closeBtn: { position: 'absolute', top: 16, right: 20, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  modalAvatarWrap: { alignSelf: 'center', marginTop: 10, marginBottom: 14, position: 'relative' },
  modalAvatar: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  modalAvatarRing: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 49, borderWidth: 2, borderColor: 'rgba(139,92,246,0.5)' },
  modalAvatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  modalDevName: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center', letterSpacing: -0.4 },
  modalDevTitle: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
  builtBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 10, backgroundColor: 'rgba(139,92,246,0.16)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  builtText: { color: '#a78bfa', fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 20 },
  contactHeading: { color: COLORS.textFaint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  contactIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(139,92,246,0.14)', alignItems: 'center', justifyContent: 'center' },
  contactLabel: { color: COLORS.textMuted, fontSize: 11, marginBottom: 2 },
  contactValue: { color: COLORS.text, fontSize: 13, fontWeight: '600' },

  // Sign-out syncing popup
  syncOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  syncCard: { backgroundColor: COLORS.cardElevated, borderRadius: RADIUS.xxl, paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center', width: '100%', ...SHADOW.sheet },
  syncSpinner: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: 'rgba(16,185,129,0.2)', borderTopColor: '#10b981', marginBottom: 18 },
  syncTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  syncSubtitle: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
});