/** Shared colours. High-contrast variants follow WCAG-style strong contrast. */
export const PALETTE = {
  normal: {
    accent: 0x7be0a6,
    accentDim: 0x2c5a45,
    paused: 0xffc768,
    ringIdle: 0x3c4a44,
    ringTarget: 0xb6ffd6,
    cardBg: '#f6f1e7',
    cardInk: '#1f2a24',
    cardSub: '#5d6b63',
    cardFocus: '#7be0a6',
    cardDone: '#c9d3cd',
    mat: 0x23302a,
  },
  contrast: {
    accent: 0xffe600,
    accentDim: 0x6b6000,
    paused: 0xff8a00,
    ringIdle: 0xffffff,
    ringTarget: 0xffe600,
    cardBg: '#000000',
    cardInk: '#ffffff',
    cardSub: '#ffe600',
    cardFocus: '#ffe600',
    cardDone: '#7a7a7a',
    mat: 0x000000,
  },
} as const;

export type Palette = (typeof PALETTE)['normal'] | (typeof PALETTE)['contrast'];

export const CARD_TINTS = ['#ffb4a2', '#a8d8ff', '#ffe08a', '#c8b6ff'];
