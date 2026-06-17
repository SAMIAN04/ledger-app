// components/ui/PressRow.tsx — shared spring-press wrappers
import React, { useRef } from 'react';
import { Animated, Pressable, ViewStyle } from 'react-native';

interface PressRowProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  scaleDown?: number;
}

export function PressRow({ onPress, children, style, scaleDown = 0.97 }: PressRowProps) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: scaleDown, useNativeDriver: true, damping: 15, stiffness: 300 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 300 }).start()
        }
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

interface PressCardProps {
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function PressCard({
  onPress,
  onLongPress,
  delayLongPress = 400,
  children,
  style,
}: PressCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, damping: 15, stiffness: 300 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 300 }).start()
        }
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
