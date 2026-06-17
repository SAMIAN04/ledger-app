/**
 * FrostedGlass.tsx
 * Solid, opaque elevated surface used by cards and the floating tab bar.
 * No translucency or blur — renders identically on Android and iOS, with
 * depth coming from tone + shadow instead of a frosted/glass effect.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/theme';

interface Props {
  style?: ViewStyle | ViewStyle[];
  intensity?: 'light' | 'medium' | 'heavy';
  tint?: string;
  children?: React.ReactNode;
}

const SURFACE: Record<'light' | 'medium' | 'heavy', string> = {
  light:  COLORS.cardElevated,
  medium: COLORS.card,
  heavy:  '#0C1017',
};

export function FrostedGlass({ style, intensity = 'heavy', children }: Props) {
  return (
    <View style={[styles.root, { backgroundColor: SURFACE[intensity] }, style]}>
      {children}
    </View>
  );
}

export default FrostedGlass;
const styles = StyleSheet.create({ root: { overflow: 'hidden' } });
