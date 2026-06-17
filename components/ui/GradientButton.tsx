// components/ui/GradientButton.tsx
import React from 'react';
import {
  ActivityIndicator, StyleSheet, Text,
  TouchableOpacity, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RADIUS, FONT, SHADOW } from '@/constants/theme';

interface Props {
  label?: string;
  title?: string;           // legacy compat
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  colors?: readonly [string, string, ...string[]];
  style?: ViewStyle;
  textStyle?: any;
}

export function GradientButton({
  label, title, onPress, loading, disabled,
  colors = ['#10b981', '#059669'],
  style, textStyle,
}: Props) {
  const text = label ?? title ?? '';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[{ opacity: disabled || loading ? 0.5 : 1 }, style]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.btn}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.text, textStyle]}>{text}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default GradientButton;

const styles = StyleSheet.create({
  btn: {
    height: 48,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    ...SHADOW.raised,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FONT.md,
  },
});