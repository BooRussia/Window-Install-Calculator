import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { ANTON, INTER } from '../fonts';
import { easeOutWin, win } from '../motion';

/**
 * S1 (f0–120): the clipboard. Paper world, graphite scribbles, crossed-out math.
 * S2 (f120–230): the clock spins 7→11 PM. "YOUR EVENINGS. GONE."
 * Jitter on props only — words stay steady (phone-legibility rule).
 */

const PAPER = '#ede8de';
const GRAPHITE = '#26221c';
const ROSE = '#c93a52';

const SCRIBBLE = 'Marker Felt, Bradley Hand, Segoe Print, cursive';

/** deterministic prop jitter */
const jit = (frame: number, seed: number, amp = 2) => ({
  x: Math.sin(frame * 0.9 + seed * 13.7) * amp,
  y: Math.cos(frame * 1.1 + seed * 7.3) * amp,
  r: Math.sin(frame * 0.7 + seed * 3.1) * 0.4,
});

const inkLen = (p: number, len: number) => ({
  strokeDasharray: len,
  strokeDashoffset: len * (1 - Math.min(1, Math.max(0, p))),
});

export const Pain: React.FC = () => {
  const frame = useCurrentFrame();

  // ---- global paper look
  const flash = interpolate(frame, [0, 12], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dimEnd = win(frame, 196, 226); // desaturate/dim at the end of S2

  // S1 beats
  const scribble1 = easeOutWin(frame, 16, 34); // "27 windows??"
  const scribble2 = easeOutWin(frame, 36, 54); // "240 LF × $??/LF"
  const cross1 = easeOutWin(frame, 52, 62);
  const slam1 = easeOutWin(frame, 58, 66); // 7:43 PM.
  const scribble3 = easeOutWin(frame, 72, 90); // $18,000… $21,000?
  const cross2 = easeOutWin(frame, 90, 100);
  const slam2 = easeOutWin(frame, 100, 108); // STILL QUOTING.

  // S1 → S2 hard cut at f120
  const s2 = frame >= 120;
  const f2 = frame - 120;
  const clockDraw = easeOutWin(f2, 4, 26);
  const handSpin = interpolate(f2, [22, 62], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // hour hand 7PM→11PM = 120°; minute hand 4 full turns
  const hourAngle = 30 + handSpin * 120;
  const minAngle = handSpin * 4 * 360;
  const stamp = easeOutWin(f2, 48, 56); // −$1,400
  const shim = easeOutWin(f2, 40, 58); // "Forgot the shim packs."
  const slam3 = easeOutWin(f2, 62, 70); // YOUR EVENINGS. GONE.

  const j1 = jit(frame, 1);
  const j2 = jit(frame, 2);
  const j3 = jit(frame, 3, 1.5);

  return (
    <AbsoluteFill style={{ background: PAPER, overflow: 'hidden' }}>
      {/* paper fiber + vignette */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(1200px 800px at 30% 20%, rgba(255,255,255,0.5), transparent 60%), radial-gradient(1400px 900px at 80% 90%, rgba(120,100,70,0.16), transparent 65%)',
        }}
      />
      {/* coffee ring */}
      <div
        style={{
          position: 'absolute',
          right: 240 + j3.x,
          top: 130 + j3.y,
          width: 190,
          height: 190,
          borderRadius: 999,
          border: '14px solid rgba(120,80,40,0.13)',
          boxShadow: 'inset 0 0 0 3px rgba(120,80,40,0.07)',
          filter: 'blur(1px)',
        }}
      />

      {!s2 ? (
        <>
          {/* clipboard clip (ink-drawn) */}
          <svg
            width="380"
            height="120"
            viewBox="0 0 380 120"
            style={{ position: 'absolute', left: 770 + j1.x, top: 40 + j1.y, transform: `rotate(${j1.r}deg)` }}
          >
            <path
              d="M60 100 L60 40 Q60 14 110 14 L270 14 Q320 14 320 40 L320 100"
              fill="none"
              stroke={GRAPHITE}
              strokeWidth="7"
              strokeLinecap="round"
              {...inkLen(easeOutWin(frame, 4, 22), 620)}
            />
            <rect x="150" y="52" width="80" height="34" rx="8" fill="none" stroke={GRAPHITE} strokeWidth="6" opacity={easeOutWin(frame, 14, 24)} />
          </svg>

          {/* scribbled estimate math (props → jitter ok) */}
          <div
            style={{
              position: 'absolute',
              left: 560 + j1.x,
              top: 300 + j1.y,
              fontFamily: SCRIBBLE,
              fontSize: 64,
              color: GRAPHITE,
              transform: `rotate(${-2 + j1.r}deg)`,
              opacity: scribble1,
            }}
          >
            27 windows??
          </div>
          <div
            style={{
              position: 'absolute',
              left: 620 + j2.x,
              top: 420 + j2.y,
              fontFamily: SCRIBBLE,
              fontSize: 58,
              color: GRAPHITE,
              transform: `rotate(${1.2 + j2.r}deg)`,
              opacity: scribble2,
            }}
          >
            240 LF × $??/LF
          </div>
          {/* rose slash through $?? */}
          <svg width="240" height="90" viewBox="0 0 240 90" style={{ position: 'absolute', left: 848 + j2.x, top: 412 + j2.y }}>
            <path d="M18 70 L214 16" fill="none" stroke={ROSE} strokeWidth="9" strokeLinecap="round" {...inkLen(cross1, 205)} />
          </svg>
          <div
            style={{
              position: 'absolute',
              left: 585 + j3.x,
              top: 545 + j3.y,
              fontFamily: SCRIBBLE,
              fontSize: 60,
              color: GRAPHITE,
              transform: `rotate(${-1 + j3.r}deg)`,
              opacity: scribble3,
            }}
          >
            $18,000… $21,000?
          </div>
          <svg width="560" height="100" viewBox="0 0 560 100" style={{ position: 'absolute', left: 560 + j3.x, top: 540 + j3.y }}>
            <path d="M30 78 C 180 40 380 66 530 30" fill="none" stroke={ROSE} strokeWidth="9" strokeLinecap="round" {...inkLen(cross2, 520)} />
          </svg>

          {/* steady display copy */}
          <div
            style={{
              position: 'absolute',
              left: 120,
              top: 120,
              fontFamily: ANTON,
              fontSize: 130,
              color: GRAPHITE,
              opacity: slam1,
              transform: `scale(${1.15 - 0.15 * slam1})`,
              transformOrigin: 'left top',
              letterSpacing: '0.01em',
            }}
          >
            7:43 PM.
          </div>
          <div
            style={{
              position: 'absolute',
              left: 120,
              top: 700,
              fontFamily: ANTON,
              fontSize: 170,
              color: GRAPHITE,
              opacity: slam2,
              transform: `scale(${1.15 - 0.15 * slam2})`,
              transformOrigin: 'left top',
              letterSpacing: '0.01em',
            }}
          >
            STILL QUOTING.
          </div>
        </>
      ) : (
        <>
          {/* S2 — the clock */}
          <svg
            width="560"
            height="560"
            viewBox="0 0 200 200"
            style={{ position: 'absolute', left: 1120 + j1.x, top: 240 + j1.y, transform: `rotate(${j1.r}deg)` }}
          >
            <circle cx="100" cy="100" r="86" fill="none" stroke={GRAPHITE} strokeWidth="6" {...inkLen(clockDraw, 545)} />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * 30 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={100 + Math.sin(a) * 76}
                  y1={100 - Math.cos(a) * 76}
                  x2={100 + Math.sin(a) * 84}
                  y2={100 - Math.cos(a) * 84}
                  stroke={GRAPHITE}
                  strokeWidth="4"
                  strokeLinecap="round"
                  opacity={clockDraw > (i + 2) / 14 ? 1 : 0}
                />
              );
            })}
            <line x1="100" y1="100" x2={100 + Math.sin((hourAngle * Math.PI) / 180) * 44} y2={100 - Math.cos((hourAngle * Math.PI) / 180) * 44} stroke={GRAPHITE} strokeWidth="7" strokeLinecap="round" opacity={clockDraw > 0.8 ? 1 : 0} />
            <line x1="100" y1="100" x2={100 + Math.sin((minAngle * Math.PI) / 180) * 66} y2={100 - Math.cos((minAngle * Math.PI) / 180) * 66} stroke={GRAPHITE} strokeWidth="4.5" strokeLinecap="round" opacity={clockDraw > 0.8 ? 1 : 0} />
            <circle cx="100" cy="100" r="5" fill={GRAPHITE} opacity={clockDraw > 0.8 ? 1 : 0} />
          </svg>

          {/* forgot the shim packs + rose stamp */}
          <div
            style={{
              position: 'absolute',
              left: 190 + j2.x,
              top: 620 + j2.y,
              fontFamily: SCRIBBLE,
              fontSize: 54,
              color: GRAPHITE,
              transform: `rotate(${-1.6 + j2.r}deg)`,
              opacity: shim,
            }}
          >
            Forgot the shim packs.
          </div>
          <div
            style={{
              position: 'absolute',
              left: 780,
              top: 590,
              fontFamily: ANTON,
              fontSize: 76,
              color: ROSE,
              border: `6px solid ${ROSE}`,
              borderRadius: 10,
              padding: '2px 22px',
              transform: `rotate(-7deg) scale(${stamp > 0 ? 1.6 - 0.6 * stamp : 0})`,
              opacity: stamp,
              letterSpacing: '0.03em',
            }}
          >
            −$1,400
          </div>

          {/* steady display copy */}
          <div
            style={{
              position: 'absolute',
              left: 120,
              top: 180,
              fontFamily: ANTON,
              fontSize: 150,
              lineHeight: 1.08,
              color: GRAPHITE,
              opacity: slam3,
              transform: `scale(${1.12 - 0.12 * slam3})`,
              transformOrigin: 'left top',
              letterSpacing: '0.01em',
            }}
          >
            YOUR EVENINGS.
            <br />
            GONE.
          </div>
        </>
      )}

      {/* end-of-pain desaturation + dim */}
      <AbsoluteFill style={{ background: '#1c1712', opacity: dimEnd * 0.55, pointerEvents: 'none' }} />
      {/* opening white flash */}
      <AbsoluteFill style={{ background: '#fff', opacity: flash, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
