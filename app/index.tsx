// app/index.tsx — entry point redirect
//
// Waits for `authReady` (set by _layout.tsx after onAuthStateChanged fires for
// the first time) before choosing a destination. Without this gate, uid is null
// on cold start and we'd always flash the login screen even for a logged-in user.

import { Redirect } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function Index() {
  const uid       = useAppStore((s) => s.uid);
  const authReady = useAppStore((s) => s.authReady);

  // Auth state not yet resolved → keep showing the loading screen
  // (_layout.tsx's AuthGate is already showing its own LoadingScreen during
  //  SQLite hydration, so this covers the tiny gap between hydration finishing
  //  and onAuthStateChanged firing for the first time.)
  if (!authReady) return <LoadingScreen />;

  return <Redirect href={uid ? '/(tabs)/home' : '/(auth)/login'} />;
}
