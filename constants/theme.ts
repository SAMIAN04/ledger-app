// constants/theme.ts

export const COLORS = {
  background:   '#030712',

  // Solid, opaque elevated surfaces (no translucency / blur).
  // Cards read as raised panels through tone + shadow, not borders.
  card:         '#10151D',
  cardElevated: '#161C27',
  sheet:        '#141A26',

  input:        'rgba(255,255,255,0.06)',

  primary:      '#10b981',
  secondary:    '#3b82f6',
  danger:       '#ef4444',
  warning:      '#f59e0b',
  text:         '#ffffff',
  textSecondary:'#e2e8f0',
  textSlate:    '#94a3b8',
  textMuted:    '#64748b',
  textFaint:    '#475569',
};

export const RADIUS = {
  sm:   10,
  md:   14,
  lg:   18,
  xl:   20,
  xxl:  24,
  card: 28,
  full: 999,
};

export const SPACING = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32,
};

export const FONT = {
  xs:   11,
  sm:   13,
  md:   15,
  body: 14,
  lg:   18,
  xl:   24,
  xxl:  36,
};

// Shared elevation shadows — used instead of borders to separate solid
// cards/sheets from the background. Tuned to be visible on a near-black
// background without relying on expo-blur (Android-safe).
export const SHADOW = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  row: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  fab: {
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  nav: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 14,
  },
};
