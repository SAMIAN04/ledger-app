// app/(auth)/login.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  TextInput as RNTextInput,
  Keyboard,
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

  // Refs for focus chaining (no state changes, no re-renders)
  const emailRef    = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);
  const nameRef     = useRef<RNTextInput>(null);

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

  const formContent = (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <View style={styles.card}>

        {/* ── Logo */}
        <View style={styles.logoWrap}>
          <LinearGradient
            colors={['#10b981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoBox}
          />
        </View>
        <Text style={styles.appName}>LEDGER</Text>
        <Text style={styles.tagline}>FINANCE OS</Text>

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
              ref={emailRef}
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              placeholder="you@example.com"
            />
            <InputField
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              showPasswordToggle
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
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
              ref={nameRef}
              label="Display Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              blurOnSubmit={false}
              placeholder="Your name"
            />
            <InputField
              ref={emailRef}
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              placeholder="you@example.com"
            />
            <InputField
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              showPasswordToggle
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
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
  );

  // On iOS: KeyboardAvoidingView with padding lifts the form above the keyboard.
  // On Android: adjustResize (set by Expo) already shrinks the window — wrapping
  // with KeyboardAvoidingView on top of that causes double-adjustment (the shake).
  // So on Android we render the ScrollView directly inside SafeAreaView.
  return (
    <SafeAreaView style={styles.safe}>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={60}>
          {formContent}
        </KeyboardAvoidingView>
      ) : (
        formContent
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: COLORS.background },
  flex:  { flex: 1 },

  scroll: {
    flexGrow: 1,
    // No justifyContent:'center' — that causes layout recalc jumps when
    // keyboard opens and the viewport height changes (adjustResize).
    // Use paddingTop to push the card down visually instead.
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 32,
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

  logoWrap: { alignItems: 'center', marginBottom: 10 },
  logoBox:  { width: 60, height: 60, borderRadius: 16 },

  appName: {
    textAlign: 'center', color: '#fff',
    fontSize: 24, fontWeight: '900', letterSpacing: -1, marginBottom: 2,
  },
  tagline: {
    textAlign: 'center', color: COLORS.primary,
    fontSize: 11, letterSpacing: 5, marginBottom: 24,
  },

  tabsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12, padding: 4, marginBottom: 20,
  },
  tabPill:           { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabPillActive:     { backgroundColor: '#10b981' },
  tabPillText:       { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  tabPillTextActive: { color: '#fff' },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
    ...SHADOW.raised,
  },
  errorText: { color: '#fca5a5', fontSize: 13, lineHeight: 18 },
});