/**
 * Anchor design tokens — extracted verbatim from index.html (:root + component CSS).
 * Bronze-gold on deep navy; glassy slate surfaces; gold reserved for emphasis.
 */
export const T = {
  // Brand golds
  gold: '#b58f4a',
  goldHi: '#c9a558',
  goldPale: '#dfc07a',
  goldLo: '#8a6a2e',
  goldGlow: 'rgba(181,143,74,0.28)',
  goldSoft: 'rgba(181,143,74,0.10)',
  inkOnGold: '#0b1020',

  // Backgrounds
  navy: '#020617',
  surfaceOpaque: '#0b1120',
  bgAmbient:
    'radial-gradient(1200px 600px at 50% -10%, rgba(181,143,74,0.12), transparent 60%), radial-gradient(800px 500px at 100% 100%, rgba(138,106,46,0.06), transparent 60%)',
  heroAmbient:
    'radial-gradient(1100px 620px at 50% -6%, rgba(181,143,74,0.16), transparent 62%), radial-gradient(760px 520px at 102% 14%, rgba(138,106,46,0.08), transparent 60%)',

  // Surfaces
  cardBg: 'linear-gradient(180deg, rgba(15,23,42,0.7) 0%, rgba(2,6,23,0.7) 100%)',
  cardBorder: 'rgba(30,41,59,0.9)',
  controlBg: 'rgba(15,23,42,0.6)',
  controlBgFocus: 'rgba(15,23,42,0.95)',
  controlBorder: 'rgba(51,65,85,0.6)',
  navBg: 'rgba(8,20,42,0.45)',
  navBorder: 'rgba(120,150,200,0.14)',

  // Text (slate scale)
  text0: '#f8fafc',
  text1: '#f1f5f9',
  text2: '#e2e8f0',
  text3: '#cbd5e1',
  text4: '#94a3b8',
  text5: '#64748b',
  text6: '#475569',

  // Status
  emerald: '#34d399',
  emeraldSoft: 'rgba(16,185,129,0.12)',
  emeraldBorder: 'rgba(16,185,129,0.45)',
  rose: '#f43f5e',

  // Effects
  focusRing: '0 0 0 4px rgba(181,143,74,0.10)',
  ctaShadow: '0 10px 30px -10px rgba(181,143,74,0.55)',
  menuShadow: '0 24px 48px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
  goldBtnGrad: 'linear-gradient(180deg, #c9a558 0%, #b58f4a 100%)',
  goldTextGrad: 'linear-gradient(180deg, #dfc07a, #b58f4a)',
  priceTextGrad: 'linear-gradient(180deg, #ffffff, #cbd5e1)',

  // Radii
  rInner: 10,
  rToast: 12,
  rControl: 14,
  rCard: 16,
  rModal: 24,
} as const;

/** Tabular numerals — the app applies this to all money. */
export const TNUM: React.CSSProperties = {
  fontFeatureSettings: '"tnum"',
  fontVariantNumeric: 'tabular-nums',
};

export const money = (n: number): string =>
  '$' +
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money0 = (n: number): string =>
  '$' + Math.round(n).toLocaleString('en-US');
