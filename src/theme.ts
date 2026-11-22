export const colors = {
  background: '#000000',
  surface: '#09090A',
  surfaceRaised: '#131315',
  border: '#232327',
  borderSoft: '#141416',
  foreground: '#F5F2EA',
  muted: '#9C988E',
  dim: '#6A665F',
  accent: '#D9B36C',
  accentSoft: 'rgba(217,179,108,0.12)',
  focus: '#D9B36C',
  overlay: 'rgba(0,0,0,0.72)',
  warning: '#E8B85C',
  danger: '#FF8B7C',
  success: '#9BE7B2',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  micro: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '600' as const,
  },
  label: {
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: 0.2,
    fontWeight: '600' as const,
  },
  result: {
    fontSize: 30,
    lineHeight: 39,
    letterSpacing: -0.2,
    fontWeight: '500' as const,
  },
} as const;
