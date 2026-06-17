// app/(auth)/login.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '@/lib/firebase';
import { InputField } from '@/components/ui/InputField';
import { GradientButton } from '@/components/ui/GradientButton';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';

export default function LoginScreen() {
  const [tab,      setTab]      = useState<'login' | 'signup'>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  function switchTab(t: 'login' | 'signup') {
    setTab(t);
    setError('');
    Keyboard.dismiss();
  }

  async function doLogin() {
    if (!email.trim() || !password) {
      setError('Please enter email and password.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      setError(e.message?.replace('Firebase: ', '') ?? 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  async function doSignup() {
    if (!name.trim() || !email.trim() || !password) {
      setError('Please fill all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const cred = await createUserWithEmailAndPassword(
        auth, email.trim(), password,
      );
      await updateProfile(cred.user, { displayName: name.trim() });
      await setDoc(
        doc(db, 'users', cred.user.uid),
        { name: name.trim(), email: email.trim(), createdAt: serverTimestamp() },
        { merge: true },
      );
    } catch (e: any) {
      setError(e.message?.replace('Firebase: ', '') ?? 'Sign up failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Card */}
          <View style={styles.card}>

            {/* ── Logo */}
            <View style={styles.logoWrap}>
              <LinearGradient
                colors={['#030712', '#030712']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoBox}
              >
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </LinearGradient>
            </View>

            <Text style={styles.appName}>LEDGER</Text>
            <Text style={styles.tagline}>SAMIAN'S FINANCE OS</Text>

            {/* ── Tabs */}
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[styles.tabPill, tab === 'login' && styles.tabPillActive]}
                onPress={() => switchTab('login')}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabPillText, tab === 'login' && styles.tabPillTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabPill, tab === 'signup' && styles.tabPillActive]}
                onPress={() => switchTab('signup')}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabPillText, tab === 'signup' && styles.tabPillTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Error box */}
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* ── Login form */}
            {tab === 'login' && (
              <>
                <InputField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  returnKeyType="next"
                  placeholder="you@example.com"
                />
                <InputField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  showPasswordToggle
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={doLogin}
                  placeholder="••••••••"
                />
                <GradientButton
                  label={loading ? 'Signing in…' : 'Sign In'}
                  onPress={doLogin}
                  loading={loading}
                  disabled={loading}
                />
              </>
            )}

            {/* ── Signup form */}
            {tab === 'signup' && (
              <>
                <InputField
                  label="Display Name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  placeholder="Your name"
                />
                <InputField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  returnKeyType="next"
                  placeholder="you@example.com"
                />
                <InputField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  showPasswordToggle
                  secureTextEntry
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={doSignup}
                  placeholder="At least 6 characters"
                />
                <GradientButton
                  label={loading ? 'Creating account…' : 'Create Account'}
                  onPress={doSignup}
                  loading={loading}
                  disabled={loading}
                />
              </>
            )}

          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  card: {
    backgroundColor: COLORS.cardElevated,
    borderRadius: RADIUS.card,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.6,
    shadowRadius: 60,
    elevation: 20,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  logoBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 80,
    height: 80,
  },
  appName: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 2,
  },
  tagline: {
    textAlign: 'center',
    color: COLORS.primary,
    fontSize: 11,
    letterSpacing: 3,
    marginBottom: 24,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: '#10b981',
  },
  tabPillText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  tabPillTextActive: {
    color: '#fff',
  },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    ...SHADOW.raised,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 18,
  },
});
