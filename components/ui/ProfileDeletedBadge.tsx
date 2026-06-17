// components/ui/ProfileDeletedBadge.tsx
//
// Centered red "Profile deleted" pill, absolutely positioned to cover its
// parent. Used by TransactionCard and any other transaction row that needs
// to flag a Debt/Lent entry whose linked Financial Profile was deleted.
//
// The parent container needs `position: 'relative', overflow: 'hidden'`,
// and its dimmable content should be wrapped separately (e.g. opacity 0.35)
// so this badge stays fully legible on top.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SHADOW } from '@/constants/theme';

export function ProfileDeletedBadge() {
  return (
    <View style={s.overlay} pointerEvents="none">
      <View style={s.pill}>
        <Text style={s.text}>Profile deleted</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  pill: {
    backgroundColor: 'rgba(10,10,14,0.85)',
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 4,
    ...SHADOW.raised,
  },
  text: { color: '#ef4444', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
});
