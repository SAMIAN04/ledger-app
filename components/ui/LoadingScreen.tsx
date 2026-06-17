// components/ui/LoadingScreen.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS } from '@/constants/theme';

export function LoadingScreen() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
      <Text style={styles.text}>Loading LEDGER…</Text>
    </View>
  );
}

export default LoadingScreen;

const styles = StyleSheet.create({
 container: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,

  backgroundColor: COLORS.background,

  alignItems: 'center',
  justifyContent: 'center',

  zIndex: 9999,
  elevation: 9999,
},
  spinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(16,185,129,0.2)',
    borderTopColor: '#10b981',
    marginBottom: 80,
  },
  text: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});