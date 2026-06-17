// app/debt-lending/create-profile.tsx — Create Financial Profile
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Animated, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useProfiles } from '@/hooks/useProfiles';
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

export default function CreateProfileScreen() {
  const router = useRouter();
  const { createProfile } = useProfiles();

  const [name, setName] = useState('');
  const [type, setType] = useState<ProfileType>('person');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const slideY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 160 }),
    ]).start();
  }, []);

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setProfilePic('data:image/jpeg;base64,' + result.assets[0].base64);
    }
  }

  async function submit() {
    if (!name.trim()) { Alert.alert('Name required', 'Please enter a name for this profile.'); return; }
    setLoading(true);
    try {
      await createProfile({ name: name.trim(), type, phone, email, notes, profilePic, interestType: 'none' });
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not create profile.');
    } finally {
      setLoading(false);
    }
  }

  const accentColor = '#3b82f6';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={['#030712', '#060d1a']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.ScrollView
          style={{ opacity, transform: [{ translateY: slideY }] }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar Picker */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarPicker} onPress={pickPhoto}>
              {profilePic ? (
                <Image source={{ uri: profilePic }} style={styles.avatarImg} />
              ) : (
                <LinearGradient colors={[accentColor + '33', accentColor + '11']} style={styles.avatarPlaceholder}>
                  <Text style={[styles.avatarInitials, { color: accentColor }]}>
                    {getInitials(name)}
                  </Text>
                </LinearGradient>
              )}
              <View style={styles.avatarCameraBtn}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to add photo</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <InputField
              label="Full Name *"
              value={name}
              onChangeText={setName}
              placeholder="e.g. John Doe, ABC Bank"
              autoCapitalize="words"
            />

            <SelectField
              label="Relationship Type"
              value={type}
              options={TYPE_OPTIONS}
              onChange={(v) => setType(v as ProfileType)}
            />

            <InputField
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              placeholder="Optional"
              keyboardType="phone-pad"
            />

            <InputField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="Optional"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <InputField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Any additional notes…"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Submit */}
          <GradientButton
            label={loading ? 'Creating…' : 'Create Profile'}
            onPress={submit}
            disabled={loading || !name.trim()}
            colors={['#3b82f6', '#1d4ed8']}
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
  headerTitle: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700' },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },

  avatarSection: { alignItems: 'center', paddingVertical: SPACING.lg },
  avatarPicker: { width: 88, height: 88, borderRadius: 44, position: 'relative' },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 28, fontWeight: '700' },
  avatarCameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#030712',
  },
  avatarHint: { color: COLORS.textMuted, fontSize: FONT.xs, marginTop: 8 },

  form: { gap: SPACING.sm, marginBottom: SPACING.lg },
});
