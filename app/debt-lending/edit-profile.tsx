// app/debt-lending/edit-profile.tsx — Edit Financial Profile
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Animated, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useProfiles } from '@/hooks/useProfiles';
import { useProfilesStore } from '@/store/useProfilesStore';
import { InputField } from '@/components/ui/InputField';
import { SelectField } from '@/components/ui/SelectField';
import { GradientButton } from '@/components/ui/GradientButton';
import { COLORS, RADIUS, SPACING, FONT } from '@/constants/theme';
import { ProfileType } from '@/types/profiles';

const TYPE_OPTIONS = [
  { value: 'friend',   label: '👥 Friend' },
  { value: 'family',   label: '🏠 Family' },
  { value: 'person',   label: '🧑 Person' },
  { value: 'bank',     label: '🏦 Bank' },
  { value: 'company',  label: '💼 Company' },
  { value: 'business', label: '🏪 Business' },
  { value: 'other',    label: '⚪ Other' },
];

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export default function EditProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileId: string }>();
  const profileId = params.profileId;

  const { profiles } = useProfilesStore();
  const { updateProfile } = useProfiles();
  const profile = profiles.find(p => p.id === profileId);

  const [name, setName] = useState(profile?.name || '');
  const [type, setType] = useState<ProfileType>(profile?.type || 'person');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [notes, setNotes] = useState(profile?.notes || '');
  const [profilePic, setProfilePic] = useState<string | null>(profile?.profilePic || null);
  const [loading, setLoading] = useState(false);

  const slideY = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 160 }),
    ]).start();
  }, []);

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setProfilePic('data:image/jpeg;base64,' + result.assets[0].base64);
    }
  }

  async function submit() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setLoading(true);
    try {
      await updateProfile(profileId, { name: name.trim(), type, phone, email, notes, profilePic });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save changes.');
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={['#030712', '#060d1a']} style={StyleSheet.absoluteFill} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.ScrollView
          style={{ opacity, transform: [{ translateY: slideY }] }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarPicker} onPress={pickPhoto}>
              {profilePic ? (
                <Image source={{ uri: profilePic }} style={styles.avatarImg} />
              ) : (
                <LinearGradient colors={['#3b82f633', '#3b82f611']} style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{getInitials(name)}</Text>
                </LinearGradient>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.form}>
            <InputField label="Full Name *" value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />
            <SelectField label="Type" value={type} options={TYPE_OPTIONS} onChange={(v) => setType(v as ProfileType)} />
            <InputField label="Phone" value={phone} onChangeText={setPhone} placeholder="Optional" keyboardType="phone-pad" />
            <InputField label="Email" value={email} onChangeText={setEmail} placeholder="Optional" keyboardType="email-address" autoCapitalize="none" />
            <InputField label="Notes" value={notes} onChangeText={setNotes} placeholder="Notes…" multiline numberOfLines={3} />
          </View>
          <GradientButton label={loading ? 'Saving…' : 'Save Changes'} onPress={submit} disabled={loading || !name.trim()} colors={['#3b82f6', '#1d4ed8']} />
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
  headerTitle: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700' },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  avatarSection: { alignItems: 'center', paddingVertical: SPACING.lg },
  avatarPicker: { width: 80, height: 80, borderRadius: 40, position: 'relative' },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 24, fontWeight: '700', color: '#3b82f6' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#030712',
  },
  form: { gap: SPACING.sm, marginBottom: SPACING.lg },
});
