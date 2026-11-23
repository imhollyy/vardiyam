// C · Vardiya Blokları — design system tokens

// ─── Shift palette (mode-aware, not theme tokens) ────────────────────────────
export const shiftPalette = {
  day: {
    light:  { background: '#FFD166', text: '#1B1A17', textSecondary: '#5A4300' },
    dark:   { background: '#FFD166', text: '#1B1A17', textSecondary: '#5A4300' },
  },
  evening: {
    light:  { background: '#F4A261', text: '#1B1A17', textSecondary: '#3D2000' },
    dark:   { background: '#F4A261', text: '#1B1A17', textSecondary: '#3D2000' },
  },
  night: {
    light:  { background: '#23305E', text: '#FFFFFF', textSecondary: '#B4C4FF' },
    dark:   { background: '#3A4A8C', text: '#FFFFFF', textSecondary: '#B4C4FF' },
  },
  leave: {
    light:  { background: '#9BE1C4', text: '#0F3B2A', textSecondary: '#1E6B4D' },
    dark:   { background: '#7FD3B0', text: '#0F3B2A', textSecondary: '#1E6B4D' },
  },
  holiday: {
    light:  { background: '#E8E2D6', text: '#5E5A51', textSecondary: '#8B8577' },
    dark:   { background: '#2F2C25', text: '#B5AD9C', textSecondary: '#8B8577' },
  },
  planned: {
    light:  { background: '#FFF4D6', borderColor: '#D9B44A', text: '#1B1A17' },
    dark:   { background: '#302A14', borderColor: '#C4A030', text: '#F3EEE3' },
  },
} as const;

export type ShiftKind = keyof typeof shiftPalette;

// ─── Theme colors ─────────────────────────────────────────────────────────────
export const colors = {
  light: {
    // Surfaces
    background:     '#F6F2EA',
    surface:        '#FFFFFF',
    surfaceMuted:   '#F1ECE2',
    surfaceSunken:  '#E8E2D6',
    inkCard:        '#1B1A17',

    // Text
    ink:            '#1B1A17',
    onInk:          '#F6F2EA',
    muted:          '#5E5A51',
    mutedSoft:      '#6E695E',

    // Borders
    border:         '#E3DCCD',

    // Accent
    accent:         '#2449C9',

    // States
    success:        '#13875B',
    successSurface: '#E4F5EC',
    danger:         '#A3261E',
    dangerSurface:  '#FBEAEC',
    dangerBorder:   '#F2C4BC',
    warning:        '#A75C12',
    warningSurface: '#FFF1DB',

    // Backward-compat aliases (screens not yet redesigned)
    foreground:     '#1B1A17',
    accentSurface:  '#F1ECE2',
    primaryAction:  '#2449C9',
    onPrimaryAction:'#F6F2EA',
  },
  dark: {
    background:     '#14130F',
    surface:        '#1F1D18',
    surfaceMuted:   '#2A2721',
    surfaceSunken:  '#2F2C25',
    inkCard:        '#2B2820',

    ink:            '#F3EEE3',
    onInk:          '#F6F2EA',
    muted:          '#B5AD9C',
    mutedSoft:      '#9C9585',

    border:         '#3A372F',

    accent:         '#8FA8FF',

    success:        '#66D9A4',
    successSurface: '#1D3B35',
    danger:         '#FF9B8F',
    dangerSurface:  '#45272F',
    dangerBorder:   '#5A2A25',
    warning:        '#FFD080',
    warningSurface: '#45351F',

    foreground:     '#F3EEE3',
    accentSurface:  '#2A2721',
    primaryAction:  '#8FA8FF',
    onPrimaryAction:'#F6F2EA',
  },
} as const;

// ─── Layout constants ─────────────────────────────────────────────────────────
export const layout = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 18, xxl: 24, section: 32 },
  radius: {
    input:   14,
    control: 14,
    card:    20,
    block:   26,
    day:     14,
    sheet:   26,
    pill:    999,
    handle:   3,
  },
  control: { minHeight: 48, touchTarget: 44 },
  screen: { horizontal: 18, top: 22, bottom: 32 },
  type: {
    label:   11,
    caption: 12,
    body:    15,
    section: 17,
    heading: 26,
    title:   28,
    amount:  38,
  },
} as const;

// ─── Font families (Plus Jakarta Sans) ───────────────────────────────────────
export const fonts = {
  regular:   'PlusJakartaSans_400Regular',
  medium:    'PlusJakartaSans_500Medium',
  semiBold:  'PlusJakartaSans_600SemiBold',
  bold:      'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;
