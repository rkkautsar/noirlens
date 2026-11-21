export const colors = {
  background: '#000000',
  surface: '#0B0B0C',
  surfaceRaised: '#111113',
  border: '#26262A',
  borderSoft: '#17171A',
  foreground: '#F4F1E8',
  muted: '#8D8A82',
  dim: '#55524C',
  accent: '#FFF8E7',
  warning: '#F2C14E',
  danger: '#FF7A6B',
  success: '#8FE3A8',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const typography = {
  micro: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: '600' as const,
  },
  label: {
    fontSize: 12,
    letterSpacing: 1.2,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
  result: {
    fontSize: 30,
    lineHeight: 39,
    letterSpacing: 0.2,
    fontWeight: '600' as const,
  },
} as const;
