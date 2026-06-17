// app/widget-expense.tsx
//
// Deep-link target for the widget's Expense (−) button.
// URL: ledger://widget-expense  →  expo-router route /widget-expense
//
// FIX (critical): Previously the setTimeout that pushed the add-transaction
// modal was being cancelled by its own cleanup function. When
// router.replace('/(tabs)/home') is called, React unmounts this component
// synchronously during the same reconciliation pass, which runs the
// useEffect cleanup — clearing the timeout before it fires. The modal
// never opened; the user just saw the app flash to home.
//
// Fix: we no longer return the clearTimeout from the effect. The timeout
// intentionally outlives the component; router.push is a global navigation
// action that is safe to call from an unmounted context (no state setter
// involved). A 100ms delay (vs 0ms) also gives the replace animation time
// to start before the modal push lands, producing a cleaner transition.
//
// We also set launchedFromWidget BEFORE navigating, so the add-transaction
// modal's cleanup correctly calls moveTaskToBack() on every dismiss path.

import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/useAppStore';

export default function WidgetExpenseGate() {
  const router                = useRouter();
  const setAddType            = useAppStore((s) => s.setAddTxType);
  const setLaunchedFromWidget = useAppStore((s) => s.setLaunchedFromWidget);
  const authReady             = useAppStore((s) => s.authReady);
  const uid                   = useAppStore((s) => s.uid);
  const handledRef            = useRef(false);

  useEffect(() => {
    if (!authReady || handledRef.current) return;
    handledRef.current = true;

    if (!uid) {
      router.replace('/(auth)/login');
      return;
    }

    // Flag the session before navigating so the modal's cleanup can
    // send the app back to the background on every dismiss path.
    setLaunchedFromWidget(true);
    setAddType('expense');

    // Replace this blank gate with Home so router.back() inside the modal
    // always reveals a real screen, never this invisible gate.
    router.replace('/(tabs)/home');

    // IMPORTANT: do NOT return clearTimeout here.
    // router.replace() unmounts this component during the same React
    // reconciliation pass, which would cancel the timeout before it fires.
    // The push is safe to call from a detached context — it goes through
    // the global navigation store, not component state.
    setTimeout(() => router.push('/modals/add-transaction'), 100);
  }, [authReady, uid]);

  return null;
}
