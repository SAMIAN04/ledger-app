// components/ui/ProfileAvatar.tsx
//
// Shared circular avatar for Financial Profiles (Debt/Lent people, banks,
// businesses…). Renders the profile's picture when set; otherwise falls back
// to a tinted circle showing either the profile-type icon or initials.
//
// Used anywhere the user interacts with a profile: the profile picker in
// Add Transaction, profile list/detail headers, etc.

import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function profileTypeIcon(t?: string): React.ComponentProps<typeof Ionicons>['name'] {
  return (
    {
      person: 'person', friend: 'happy', family: 'home', bank: 'business',
      company: 'briefcase', business: 'storefront', other: 'ellipsis-horizontal',
    }[t || 'person'] || 'person'
  ) as any;
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

interface Props {
  uri?: string | null;
  name: string;
  type?: string;
  size: number;
  /** Tint used for the fallback background + border */
  color: string;
  /** Color of the fallback icon/initials — defaults to `color` */
  textColor?: string;
  /** What to show when there's no picture — defaults to the profile-type icon */
  fallback?: 'icon' | 'initials';
  style?: StyleProp<ViewStyle>;
}

export function ProfileAvatar({ uri, name, type, size, color, textColor, fallback = 'icon', style }: Props) {
  const dim: ViewStyle = { width: size, height: size, borderRadius: size / 2 };
  const fg = textColor || color;

  if (uri) {
    return <Image source={{ uri }} style={[dim, styles.img, { borderColor: color + '40' }, style]} />;
  }

  return (
    <View style={[dim, styles.fallback, { backgroundColor: color + '1f', borderColor: color + '40' }, style]}>
      {fallback === 'initials' ? (
        <Text style={[styles.initials, { fontSize: size * 0.34, color: fg }]}>{getInitials(name)}</Text>
      ) : (
        <Ionicons name={profileTypeIcon(type)} size={size * 0.46} color={fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  img:      { borderWidth: 1.5 },
  fallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  initials: { fontWeight: '800' },
});
