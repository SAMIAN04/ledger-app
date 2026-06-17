/**
 * GlassModal.tsx
 * Solid full-bleed background for modal screens (add-wallet, add-transaction,
 * transfer, etc.) — fully opaque, no blur/translucency. Adds a soft single
 * ambient glow.
 *
 * Usage:
 *   <GlassModal accentColor="#10b981">
 *     {children}
 *   </GlassModal>
 */
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/theme';

// Soft ambient glow — a low-opacity colored blob, NOT a blur/glass effect.
export function GlowOrb({ color, size = 120 }: { color: string; size?: number }) {
  return (
    <>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color + '0D' }} />
      <View style={{ position: 'absolute', width: size * 0.5, height: size * 0.5, borderRadius: size / 2, backgroundColor: color + '1F' }} />
    </>
  );
}

interface Props {
  accentColor?: string;
  secondaryColor?: string;
  style?: ViewStyle;
  children: React.ReactNode;
}

export function GlassModal({
  accentColor = '#10b981',
  style,
  children,
}: Props) {
  return (
    <View style={[styles.root, style]}>
      {/* Solid elevated surface — opaque, no translucency */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.sheet }]} />

      {/* Soft ambient glow, top-right */}
      <View style={styles.orbTopRight}>
        <GlowOrb color={accentColor} size={220} />
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, overflow: 'hidden' },
  orbTopRight: { position: 'absolute', top: -80, right: -60, alignItems: 'center', justifyContent: 'center' },
});
