import React from 'react';
import { T, TNUM } from './theme';
import { ANTON, INTER } from './fonts';

/* ---------------------------------------------------------------------------
 * AnchorGlyph — the exact 6-stroke brand mark from brand/gen.mjs (100×100 space).
 * `draw` (0→1) animates stroke draw-on; 1 = fully drawn.
 * ------------------------------------------------------------------------- */
const GLYPH_STROKES: { d: string; len: number }[] = [
  { d: 'M50 11 A9 9 0 1 1 49.99 11', len: 57 }, // ring (circle as arc path)
  { d: 'M50 29 L50 82', len: 53 }, // shank
  { d: 'M33 40 L67 40', len: 34 }, // stock
  { d: 'M22 60 C 22 78 38 86 50 86 C 62 86 78 78 78 60', len: 95 }, // crown
  { d: 'M22 60 L 13 52', len: 12.1 }, // left fluke
  { d: 'M78 60 L 87 52', len: 12.1 }, // right fluke
];

export const AnchorGlyph: React.FC<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  draw?: number;
  glow?: boolean;
  style?: React.CSSProperties;
}> = ({ size = 64, color = T.goldHi, strokeWidth = 9, draw = 1, glow = false, style }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        overflow: 'visible',
        filter: glow
          ? 'drop-shadow(0 0 10px rgba(216,185,106,0.45)) drop-shadow(0 0 26px rgba(181,143,74,0.30))'
          : undefined,
        ...style,
      }}
    >
      <g fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {GLYPH_STROKES.map((s, i) => {
          // Stagger: each stroke draws in its own slice of the 0→1 progress.
          const n = GLYPH_STROKES.length;
          const slice = 1 / n;
          const local = Math.min(1, Math.max(0, (draw - i * slice * 0.72) / (slice * 1.9)));
          return (
            <path
              key={i}
              d={s.d}
              strokeDasharray={s.len}
              strokeDashoffset={s.len * (1 - local)}
              opacity={local > 0 ? 1 : 0}
            />
          );
        })}
      </g>
    </svg>
  );
};

/* ---------------------------------------------------------------------------
 * Wordmark — gold glyph + "Anchor" heavy tight text (brand/anchor-wordmark-dark.svg).
 * ------------------------------------------------------------------------- */
export const Wordmark: React.FC<{ height?: number; draw?: number; textOpacity?: number }> = ({
  height = 44,
  draw = 1,
  textOpacity = 1,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: height * 0.28 }}>
    <AnchorGlyph size={height} strokeWidth={9} draw={draw} />
    <span
      style={{
        fontFamily: INTER,
        fontWeight: 800,
        fontSize: height * 0.82,
        letterSpacing: '-0.045em',
        color: T.text1,
        opacity: textOpacity,
        lineHeight: 1,
      }}
    >
      Anchor
    </span>
  </div>
);

/* ---------------------------------------------------------------------------
 * App chrome — cloned header bar (.lp-nav, h-14, glassy navy).
 * ------------------------------------------------------------------------- */
export const AppHeader: React.FC<{ right?: React.ReactNode; scale?: number }> = ({
  right,
  scale = 1,
}) => (
  <div
    style={{
      height: 56 * scale,
      background: T.navBg,
      backdropFilter: 'blur(18px) saturate(1.6)',
      borderBottom: `1px solid ${T.navBorder}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `0 ${24 * scale}px`,
      flexShrink: 0,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 * scale }}>
      {/* rail toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5 * scale, opacity: 0.75 }}>
        {[14, 10, 14].map((w, i) => (
          <div key={i} style={{ width: w * scale, height: 2 * scale, borderRadius: 2, background: '#94a3b8' }} />
        ))}
      </div>
      <Wordmark height={30 * scale} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 * scale }}>
      {right ?? (
        <>
          <GhostPill scale={scale} gold>
            FL Lookup
          </GhostPill>
          <GhostPill scale={scale}>Dashboard</GhostPill>
          <div
            style={{
              width: 36 * scale,
              height: 36 * scale,
              borderRadius: 999,
              background: '#1e293b',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: INTER,
              fontWeight: 700,
              fontSize: 13 * scale,
              color: T.text4,
            }}
          >
            RC
          </div>
        </>
      )}
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
 * Primitives
 * ------------------------------------------------------------------------- */
export const Card: React.FC<{
  children?: React.ReactNode;
  style?: React.CSSProperties;
  radius?: number;
}> = ({ children, style, radius = T.rCard }) => (
  <div
    style={{
      background: T.cardBg,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: radius,
      backdropFilter: 'blur(20px)',
      ...style,
    }}
  >
    {children}
  </div>
);

export const GoldButton: React.FC<{
  children?: React.ReactNode;
  scale?: number;
  pressed?: boolean;
  style?: React.CSSProperties;
}> = ({ children, scale = 1, pressed = false, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8 * scale,
      background: T.goldBtnGrad,
      color: '#0a0a0a',
      borderRadius: 999,
      padding: `${13 * scale}px ${26 * scale}px`,
      fontFamily: INTER,
      fontWeight: 800,
      fontSize: 15 * scale,
      letterSpacing: '-0.01em',
      boxShadow: T.ctaShadow,
      transform: pressed ? 'translateY(1px) scale(0.985)' : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

export const GhostPill: React.FC<{
  children?: React.ReactNode;
  gold?: boolean;
  scale?: number;
  style?: React.CSSProperties;
}> = ({ children, gold = false, scale = 1, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 999,
      padding: `${6 * scale}px ${12 * scale}px`,
      fontFamily: INTER,
      fontWeight: 700,
      fontSize: 11 * scale,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: gold ? T.goldHi : T.text4,
      border: `1px solid ${gold ? 'rgba(181,143,74,0.45)' : '#334155'}`,
      background: 'transparent',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Eyebrow: React.FC<{ children?: React.ReactNode; scale?: number }> = ({
  children,
  scale = 1,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: INTER,
      fontSize: 12 * scale,
      fontWeight: 700,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: T.goldHi,
      background: T.goldSoft,
      border: '1px solid rgba(181,143,74,0.3)',
      borderRadius: 999,
      padding: `${7 * scale}px ${15 * scale}px`,
    }}
  >
    {children}
  </div>
);

/** Text input clone (.control / .dd-trigger skin) with focus + typed value. */
export const Control: React.FC<{
  label?: string;
  value?: React.ReactNode;
  placeholder?: string;
  focused?: boolean;
  caret?: boolean;
  scale?: number;
  width?: number | string;
  chevron?: boolean;
}> = ({ label, value, placeholder, focused = false, caret = false, scale = 1, width, chevron = false }) => (
  <div style={{ width }}>
    {label ? (
      <div
        style={{
          fontFamily: INTER,
          fontSize: 11 * scale,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: T.text5,
          marginBottom: 7 * scale,
        }}
      >
        {label}
      </div>
    ) : null}
    <div
      style={{
        background: focused ? T.controlBgFocus : T.controlBg,
        border: `1px solid ${focused ? T.goldHi : T.controlBorder}`,
        boxShadow: focused ? T.focusRing : undefined,
        borderRadius: T.rControl * scale,
        padding: `${12 * scale}px ${15 * scale}px`,
        fontFamily: INTER,
        fontWeight: 600,
        fontSize: 14 * scale,
        color: value ? T.text1 : 'rgba(148,163,184,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 45 * scale,
        ...TNUM,
      }}
    >
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {value || placeholder}
        {caret ? (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: 16 * scale,
              background: T.goldHi,
              marginLeft: 2,
              verticalAlign: 'middle',
            }}
          />
        ) : null}
      </span>
      {chevron ? (
        <svg width={12 * scale} height={8 * scale} viewBox="0 0 12 8" style={{ flexShrink: 0 }}>
          <path d="M1 1.5 L6 6.5 L11 1.5" stroke={focused ? T.goldHi : '#64748b'} strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      ) : null}
    </div>
  </div>
);

/** Segmented control (.seg) */
export const Seg: React.FC<{ options: string[]; active: number; scale?: number }> = ({
  options,
  active,
  scale = 1,
}) => (
  <div
    style={{
      display: 'inline-flex',
      gap: 2 * scale,
      background: T.controlBg,
      border: `1px solid ${T.controlBorder}`,
      borderRadius: 14 * scale,
      padding: 4 * scale,
    }}
  >
    {options.map((o, i) => (
      <div
        key={o}
        style={{
          padding: `${9 * scale}px ${13 * scale}px`,
          borderRadius: 10 * scale,
          fontFamily: INTER,
          fontSize: 13 * scale,
          fontWeight: 600,
          color: i === active ? T.goldHi : T.text4,
          background: i === active ? 'rgba(181,143,74,0.18)' : 'transparent',
          boxShadow: i === active ? 'inset 0 0 0 1px rgba(181,143,74,0.35)' : undefined,
          whiteSpace: 'nowrap',
        }}
      >
        {o}
      </div>
    ))}
  </div>
);

/** AI badge (✨ gradient pill) */
export const AiBadge: React.FC<{ scale?: number }> = ({ scale = 1 }) => (
  <span
    style={{
      fontFamily: INTER,
      fontSize: 10 * scale,
      fontWeight: 900,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: '#1a1206',
      background: 'linear-gradient(180deg,#d8b765,#b58f4a)',
      borderRadius: 999,
      padding: `${2 * scale}px ${8 * scale}px`,
    }}
  >
    ✨ AI
  </span>
);

/** Toast clone */
export const Toast: React.FC<{ children?: React.ReactNode; scale?: number; style?: React.CSSProperties }> = ({
  children,
  scale = 1,
  style,
}) => (
  <div
    style={{
      background: 'rgba(15,23,42,0.95)',
      border: '1px solid rgba(181,143,74,0.5)',
      color: '#fdf6e3',
      padding: `${10 * scale}px ${16 * scale}px`,
      borderRadius: 12 * scale,
      fontFamily: INTER,
      fontSize: 13 * scale,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8 * scale,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Emerald check circle */
export const CheckDot: React.FC<{ size?: number; pop?: number }> = ({ size = 20, pop = 1 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 999,
      background: T.emeraldSoft,
      border: `1px solid ${T.emeraldBorder}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transform: `scale(${pop})`,
      flexShrink: 0,
    }}
  >
    <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 12 12">
      <path d="M2 6.5 L4.8 9 L10 3" stroke={T.emerald} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

/* ---------------------------------------------------------------------------
 * Cursor — soft white pointer w/ gold click ripple.
 * ------------------------------------------------------------------------- */
export const Cursor: React.FC<{ x: number; y: number; click?: number; scale?: number }> = ({
  x,
  y,
  click = 0,
  scale = 1,
}) => (
  <div style={{ position: 'absolute', left: x, top: y, zIndex: 50, pointerEvents: 'none' }}>
    {click > 0 && click < 1 ? (
      <div
        style={{
          position: 'absolute',
          left: -26 * click * scale,
          top: -26 * click * scale,
          width: 52 * click * scale,
          height: 52 * click * scale,
          borderRadius: 999,
          border: `2px solid rgba(201,165,88,${0.9 * (1 - click)})`,
        }}
      />
    ) : null}
    <svg width={26 * scale} height={30 * scale} viewBox="0 0 26 30" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }}>
      <path
        d="M4 2 L4 22 L9.2 17.6 L12.6 25.4 L16.4 23.7 L13 16 L20 15.4 Z"
        fill="#f8fafc"
        stroke="#0f172a"
        strokeWidth="1.4"
      />
    </svg>
  </div>
);

/* Display text helpers */
export const Display: React.FC<{
  children?: React.ReactNode;
  size?: number;
  gold?: boolean;
  style?: React.CSSProperties;
}> = ({ children, size = 110, gold = false, style }) => (
  <div
    style={{
      fontFamily: ANTON,
      fontSize: size,
      textTransform: 'uppercase',
      letterSpacing: '0.01em',
      lineHeight: 1.04,
      color: gold ? undefined : T.text1,
      ...(gold
        ? {
            background: T.goldTextGrad,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }
        : {}),
      ...style,
    }}
  >
    {children}
  </div>
);

export const SilverNumber: React.FC<{ children?: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({
  children,
  size = 96,
  style,
}) => (
  <div
    style={{
      fontFamily: INTER,
      fontWeight: 900,
      letterSpacing: '-0.04em',
      fontSize: size,
      background: T.priceTextGrad,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      ...TNUM,
      ...style,
    }}
  >
    {children}
  </div>
);
