// components/ui/SyncIndicator.tsx
//
// Rendered ONLY on the Home screen header.
// All other screens have NO sync indicator.
//
// Design:
//   - Compact pill in the top-right of the Dashboard header
//   - Shows: Syncing (amber pulse) | Synced (green) | Offline (red) | Sync Failed (red)
//   - Reads directly from Zustand via a selector — zero re-render cost on other screens
//   - Animations run on the native thread (useNativeDriver: true)
//   - Component is lightweight: ~50 lines, no heavy layout

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import { SyncStatus } from '@/types';
import { SHADOW } from '@/constants/theme';

// Status → visual config
const STATUS_CONFIG: Record<SyncStatus, { dot: string; text: string; label: string }> = {
  syncing: { dot: '#f59e0b', text: '#f59e0b', label: 'Syncing' },
  synced:  { dot: '#10b981', text: '#10b981', label: 'Synced'  },
  offline: { dot: '#ef4444', text: '#ef4444', label: 'Offline' },
  failed:  { dot: '#ef4444', text: '#ef4444', label: 'Failed'  },
};

export function SyncIndicator() {
  // Granular selector — only re-renders this component when syncStatus changes.
  // Other components are completely unaffected.
  const syncStatus = useAppStore((s) => s.syncStatus);
  const syncLabel  = useAppStore((s) => s.syncLabel);

  const pulse   = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    if (syncStatus === 'syncing') {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.2, duration: 480, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,   duration: 480, useNativeDriver: true }),
        ]),
      );
      loopRef.current.start();
    } else {
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    return () => { loopRef.current?.stop(); };
  }, [syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = STATUS_CONFIG[syncStatus] ?? STATUS_CONFIG.offline;
  const displayLabel = syncLabel || cfg.label;

  return (
    <View style={[styles.pill, { backgroundColor: cfg.dot + '22' }]}>
      <Animated.View style={[styles.dot, { backgroundColor: cfg.dot, opacity: pulse }]} />
      <Text style={[styles.label, { color: cfg.text }]}>{displayLabel}</Text>
    </View>
  );
}

export default SyncIndicator;

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    ...SHADOW.raised,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
