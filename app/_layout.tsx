// app/_layout.tsx — Offline-first boot sequence
//
// Startup order (WhatsApp-style):
//   1. Show LoadingScreen immediately (covers everything)
//   2. Open SQLite, run schema migration          ← parallel
//   3. Subscribe to onAuthStateChanged            ← parallel
//   4. When BOTH are done: navigate to correct screen, drop LoadingScreen
//   5. Firestore listeners attach in background
//
// The LoadingScreen comes from AuthGate (a sibling of <Stack>).
// It sits at position:absolute / zIndex:9999 so it fully covers the Stack.
// Any LoadingScreen rendered *inside* a Stack screen cannot reliably do this
// because it shares the Stack's stacking context.

import React, { useEffect, useRef, useState } from 'react';
import { Platform, Linking } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAppStore } from '@/store/useAppStore';
import { useSyncEngine } from '@/hooks/useSyncEngine';
import { useWidgetSync } from '@/hooks/useWidgetSync';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hydratePreferences } from '@/lib/storage';
import {
  getDatabase, hydrateFromSQLite, migrateFromAsyncStorage,
  clearAllUserData,
} from '@/lib/database';
import { initProfilesSchema, hydrateProfiles } from '@/lib/profilesDatabase';
import { useProfilesStore } from '@/store/useProfilesStore';
import { COLORS } from '@/constants/theme';

function AuthGate() {
  // Two independent async operations — we wait for BOTH before showing the app.
  const [sqliteReady,  setSqliteReady]  = useState(false);
  const [authResolved, setAuthResolved] = useState(false);

  // authResolvedRef lets the auth callback check "is this the first fire?"
  // without closing over stale state.
  const authResolvedRef = useRef(false);

  const setUid               = useAppStore((s) => s.setUid);
  const setUser              = useAppStore((s) => s.setUser);
  const setPreferredCurrency = useAppStore((s) => s.setPreferredCurrency);
  const setHydrated          = useAppStore((s) => s.setHydrated);
  const setAuthReady         = useAppStore((s) => s.setAuthReady);

  const router      = useRouter();
  const segments    = useSegments();
  const segmentsRef = useRef(segments);
  const prevUidRef  = useRef<string | null>(null); // detect account switches
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  // Sync engine runs globally regardless of which screen is active.
  useSyncEngine();

  // Widget sync — writes wallet balances to SharedPreferences whenever
  // the Zustand store changes. No-op on iOS.
  useWidgetSync();

  // ── Widget deep-link cold-start handler ──────────────────────────────────
  // When the app is launched from a widget button tap (cold start), the URL
  // arrives via Linking.getInitialURL() before any screen is mounted.
  // We store it and apply it once auth + hydration have both resolved.
  const pendingWidgetUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Capture the launch URL immediately (before screens mount)
    Linking.getInitialURL().then((url) => {
      if (url && isWidgetDeepLink(url)) {
        pendingWidgetUrlRef.current = url;
      }
    }).catch(() => {});
  }, []);

  // ── Step 1: SQLite hydration ──────────────────────────────────────────────
  // Runs in parallel with Step 2. Never blocks the auth listener.
  useEffect(() => {
    (async () => {
      try {
        await getDatabase();
        await migrateFromAsyncStorage();
        const data = await hydrateFromSQLite();
        useAppStore.setState({
          wallets:      data.wallets,
          transactions: data.transactions,
          lending:      data.lending,
          debts:        data.debts,
        });
        await initProfilesSchema();
        const profilesData = await hydrateProfiles();
        useProfilesStore.setState({ profiles: profilesData });
        const prefs = await hydratePreferences();
        if (prefs.preferredCurrency) {
          useAppStore.getState().setPreferredCurrency(prefs.preferredCurrency);
        }
      } catch (e) {
        console.warn('[layout] hydration error:', e);
      }
      setHydrated(true);
      setSqliteReady(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: Auth listener — starts IMMEDIATELY, parallel to SQLite ────────
  // Previously this waited for hydration to finish, leaving a gap between
  // "SQLite done" and "auth resolved" where the Stack was uncovered.
  // Now both run in parallel; the LoadingScreen stays until both complete.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      const isInitial = !authResolvedRef.current;

      if (firebaseUser) {
        // ── Account switch: a different user just signed in ─────────────────
        if (prevUidRef.current !== null && prevUidRef.current !== firebaseUser.uid) {
          try { await clearAllUserData(); } catch {}
          useAppStore.setState({ wallets: [], transactions: [], lending: [], debts: [] });
          useProfilesStore.setState({ profiles: [] });
        }
        prevUidRef.current = firebaseUser.uid;

        setUid(firebaseUser.uid);
        setUser({ name: firebaseUser.displayName || '', email: firebaseUser.email || '' });

        // Subsequent fires (login after logout): navigate immediately.
        // Initial navigation is handled by the combined effect below.
        if (!isInitial) {
          const segs = segmentsRef.current;
          if (segs[0] === '(auth)' || segs.length === 0) router.replace('/(tabs)/home');
        }

        // Fetch Firestore profile in background
        getDoc(doc(db, 'users', firebaseUser.uid))
          .then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setUser({
                name:       data.name       || firebaseUser.displayName || '',
                email:      data.email      || firebaseUser.email       || '',
                profilePic: data.profilePic || null,
              });
              if (data.preferredCurrency) setPreferredCurrency(data.preferredCurrency);
            }
          })
          .catch(() => {});

      } else {
        // ── Signed out ───────────────────────────────────────────────────────
        prevUidRef.current = null;
        setUid(null);
        useAppStore.setState({ wallets: [], transactions: [], lending: [], debts: [] });
        useProfilesStore.setState({ profiles: [] });

        if (!isInitial) {
          const segs = segmentsRef.current;
          if (segs[0] === '(tabs)' || segs[0] === 'modals') router.replace('/(auth)/login');
        }
      }

      // Only the FIRST fire marks auth as resolved — subsequent fires
      // are live auth changes (login/logout) handled above.
      if (isInitial) {
        authResolvedRef.current = true;
        setAuthResolved(true);
      }
    });

    return () => unsub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 3: Navigate once BOTH SQLite and auth are resolved ──────────────
  useEffect(() => {
    if (!sqliteReady || !authResolved) return;

    // Signal index.tsx (and the widget-*.tsx gate screens) that auth state
    // is known.
    setAuthReady(true);

    const uid  = useAppStore.getState().uid;
    const segs = segmentsRef.current;

    // If a widget deep link already routed us straight to one of the
    // dedicated widget-*.tsx gate screens (cold start via expo-router's
    // own linking), that screen owns the navigation from here — it has its
    // own authReady-gated effect. Don't ALSO replay the URL here, or we'd
    // dispatch two competing navigations (e.g. a doubled-up modal).
    const onWidgetGateScreen =
      segs[0] === 'widget-income' || segs[0] === 'widget-expense' || segs[0] === 'widget-transfer';

    if (uid) {
      // ── Fallback: handle widget cold-start deep link ────────────────────
      // Only used if expo-router's linking did NOT land us on a widget-*.tsx
      // gate screen above (e.g. it resolved to `index` instead).
      const pendingUrl = pendingWidgetUrlRef.current;
      pendingWidgetUrlRef.current = null;
      if (pendingUrl && !onWidgetGateScreen) {
        handleWidgetUrl(pendingUrl, router, useAppStore.getState().setAddTxType);
        return; // navigation handled
      }
      // Logged-in user: go to home if still on auth/index screen
      if (segs[0] === '(auth)' || segs.length === 0) router.replace('/(tabs)/home');
    } else {
      // No user: go to login only if currently in a protected area.
      if (segs[0] === '(tabs)' || segs[0] === 'modals') router.replace('/(auth)/login');
    }
  }, [sqliteReady, authResolved]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Show loading screen until BOTH operations are complete ────────────────
  // AuthGate is a sibling to <Stack>, so this LoadingScreen (position:absolute,
  // zIndex:9999) properly overlays the navigator — no flash possible.
  if (!sqliteReady || !authResolved) return <LoadingScreen />;
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthGate />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)/login"  options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)"        options={{ headerShown: false }} />
          <Stack.Screen name="modals/add-transaction" options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="modals/add-wallet"      options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="modals/add-lending"     options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="modals/add-debt"        options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="modals/wallet-detail"   options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="modals/transfer"         options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="debt-lending"             options={{ headerShown: false }} />
          {/* Widget deep-link gates — invisible redirect screens, no fade
              since they render nothing; only widget-transfer has real UI.
              Dark contentStyle avoids a white flash during the instant
              they're the active screen on a cold start. */}
          <Stack.Screen name="widget-income"   options={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: COLORS.background } }} />
          <Stack.Screen name="widget-expense"  options={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: COLORS.background } }} />
          <Stack.Screen name="widget-transfer" options={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: COLORS.background } }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── Widget deep-link helpers ─────────────────────────────────────────────────

/** Returns true if the URL originated from a Ledger widget button tap. */
function isWidgetDeepLink(url: string): boolean {
  return url.startsWith('ledger://widget-');
}

/**
 * Navigate to the correct modal based on the widget deep-link URL.
 * This is a fallback path — see the Step 3 guard above for when it runs.
 */
function handleWidgetUrl(
  url: string,
  router: ReturnType<typeof useRouter>,
  setAddTxType: (t: 'income' | 'expense' | 'debt' | 'lent') => void,
) {
  if (url.includes('widget-income')) {
    setAddTxType('income');
    router.push('/modals/add-transaction');
  } else if (url.includes('widget-expense')) {
    setAddTxType('expense');
    router.push('/modals/add-transaction');
  } else if (url.includes('widget-transfer')) {
    // /modals/transfer requires a pre-selected fromWalletId (it's the
    // wallet-detail transfer flow). The widget lets the user pick BOTH
    // wallets, so route to its own dedicated screen instead.
    router.push('/widget-transfer');
  }
}