// components/navigation/FloatingTabBar.tsx — pure-JS frosted glass, no expo-blur
import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { FrostedGlass } from '@/components/ui/FrostedGlass';
import { SHADOW } from '@/constants/theme';

const TABS = [
  {
    name: 'home',
    icon: 'home-outline',
    iconActive: 'home-outline',
    label: 'Home',
  },
  {
    name: 'transactions',
    icon: 'swap-horizontal-outline',
    iconActive: 'swap-horizontal',
    label: 'Txns',
  },
  {
    name: 'analytics',
    icon: 'trending-up-outline',
    iconActive: 'trending-up',
    label: 'Analytics',
  },
  {
    name: 'profile',
    icon: 'person-sharp',
    iconActive: 'person-sharp',
    label: 'Profile',
  },
] as const;
const RADIUS_VAL = 34;
const BAR_HEIGHT  = 55;

function TabBtn({
  label, icon, active, onPress,
}: { label: string; icon: string; active: boolean; onPress: () => void }) {
  const scale        = useRef(new Animated.Value(1)).current;
  const labelOpacity = useRef(new Animated.Value(active ? 1 : 0.55)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,        { toValue: active ? 1.08 : 1,  useNativeDriver: true, damping: 18, stiffness: 280 }),
      Animated.timing(labelOpacity, { toValue: active ? 1 : 0.55,  duration: 180,         useNativeDriver: true }),
    ]).start();
  }, [active]);

  return (
    <TouchableOpacity
      onPress={() => {
        Animated.sequence([
          Animated.spring(scale, { toValue: 0.92,              useNativeDriver: true, damping: 15, stiffness: 400 }),
          Animated.spring(scale, { toValue: active ? 1.08 : 1, useNativeDriver: true, damping: 18, stiffness: 280 }),
        ]).start();
        onPress();
      }}
      activeOpacity={0.7}
      style={styles.tabBtn}
    >
      <Animated.View style={[styles.tabBtnInner, { transform: [{ scale }] }]}>
        {active && <View style={styles.activeIndicator} />}
        <Ionicons name={icon as any} size={23} color={active ? '#10b981' : '#4b5563'} />
        <Animated.Text style={[styles.tabLabel, active && styles.tabLabelActive, { opacity: labelOpacity }]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets    = useSafeAreaInsets();
  const bottomPad = insets.bottom || 12;
  const fabScale  = useRef(new Animated.Value(1)).current;

  return (
    <View style={[styles.outerWrap, { height: BAR_HEIGHT + bottomPad }]}>
      {/* Frosted glass base — lets background glows show through softly */}
      <FrostedGlass
        intensity="heavy"
        style={[StyleSheet.absoluteFill, styles.rounded]}
      />

      {/* Green glow strip along the top edge */}
      <View style={styles.glowStrip} />

      <View style={[styles.tabRow, { height: BAR_HEIGHT }]}>
        {TABS.slice(0, 2).map((tab) => {
          const idx     = state.routes.findIndex(r => r.name === tab.name);
          const focused = state.index === idx;
          return (
            <TabBtn
              key={tab.name}
              label={tab.label}
              icon={focused ? tab.iconActive : tab.icon}
              active={focused}
              onPress={() => { if (!focused) navigation.navigate(tab.name as any); }}
            />
          );
        })}

        {/* FAB */}
        <TouchableOpacity
          onPress={() => {
            Animated.sequence([
              Animated.spring(fabScale, { toValue: 0.88, useNativeDriver: true, damping: 15, stiffness: 400 }),
              Animated.spring(fabScale, { toValue: 1,    useNativeDriver: true, damping: 14, stiffness: 200 }),
            ]).start();
            navigation.navigate('modals/add-transaction' as any);
          }}
          activeOpacity={0.82}
          style={styles.fabWrap}
        >
          <Animated.View style={{ transform: [{ scale: fabScale }] }}>
            <LinearGradient colors={['#10b981', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
              <Text style={styles.fabPlus}>+</Text>
            </LinearGradient>
          </Animated.View>
          <View style={styles.fabGlow} />
        </TouchableOpacity>

        {TABS.slice(2, 4).map((tab) => {
          const idx     = state.routes.findIndex(r => r.name === tab.name);
          const focused = state.index === idx;
          return (
            <TabBtn
              key={tab.name}
              label={tab.label}
              icon={focused ? tab.iconActive : tab.icon}
              active={focused}
              onPress={() => { if (!focused) navigation.navigate(tab.name as any); }}
            />
          );
        })}
      </View>

      <View style={{ height: bottomPad }} />
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'black', borderStartStartRadius: RADIUS_VAL, borderStartEndRadius: RADIUS_VAL, alignItems: 'center', justifyContent: 'center', zIndex: 999, ...SHADOW.nav },
  rounded:         { borderTopLeftRadius: RADIUS_VAL, borderTopRightRadius: RADIUS_VAL },
  glowStrip:       { position: 'absolute', top: 1, left: '15%', right: '15%', height: 1, borderRadius: 10, backgroundColor: 'rgba(16, 185, 129, 0.04)', shadowColor: '#10b981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 0 },
  tabRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 4 },
  tabBtn:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  tabBtnInner:     { alignItems: 'center', gap: 3 },
  activeIndicator: { position: 'absolute', top: -8, width: 20, height: 0, borderRadius: 2, backgroundColor: '#10b981', shadowColor: '#10b981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 },
  tabLabel:        { fontSize: 0.1, fontWeight: '500', color: '#4b5563' },
  tabLabelActive:  { color: '#10b981', fontWeight: '700' },
  fabWrap:         { alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  fab:             { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', zIndex: 1, ...SHADOW.fab },
  fabGlow:         { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(16,185,129,0.28)', shadowColor: '#10b981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 20, elevation: 0 },
  fabPlus:         { color: '#fff', fontSize: 30, fontWeight: '200', lineHeight: 34, marginTop: -2 },
});
