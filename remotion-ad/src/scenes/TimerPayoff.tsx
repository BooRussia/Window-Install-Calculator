import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { T, TNUM } from '../theme';
import { ANTON, INTER } from '../fonts';
import { popIn, springIn, win } from '../motion';
import { TIMER_FINAL } from '../timeline';

/**
 * S9 (local 0–110): the frozen stopwatch lands center at 5× with a gold ring
 * shockwave; "UNDER 60 SECONDS." slams beneath — the proof beat.
 */
export const TimerPayoff: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const land = springIn(f, fps, 4, 20);
  const ring = win(f, 12, 34);
  const slam = springIn(f, fps, 30, 20);
  const subIn = win(f, 52, 66);
  const out = win(f, 96, 110);

  return (
    <AbsoluteFill style={{ background: T.navy, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: T.heroAmbient }} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          opacity: 1 - out,
          transform: `scale(${1 + out * 0.06})`,
        }}
      >
        {/* ring shockwave */}
        {ring > 0 && ring < 1 ? (
          <div
            style={{
              position: 'absolute',
              width: 420 + ring * 620,
              height: 420 + ring * 620,
              borderRadius: 999,
              border: `3px solid rgba(201,165,88,${0.85 * (1 - ring)})`,
              boxShadow: `0 0 ${40 * (1 - ring)}px rgba(201,165,88,${0.5 * (1 - ring)})`,
            }}
          />
        ) : null}

        {/* frozen stopwatch, huge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            background: 'rgba(15,23,42,0.95)',
            border: `2px solid ${T.goldHi}`,
            borderRadius: 999,
            padding: '26px 60px',
            boxShadow: '0 0 0 8px rgba(201,165,88,0.18), 0 0 60px 8px rgba(201,165,88,0.28), 0 40px 90px -30px rgba(0,0,0,0.9)',
            transform: `scale(${0.5 + 0.5 * land})`,
            opacity: land,
          }}
        >
          <div style={{ width: 22, height: 22, borderRadius: 999, background: T.emerald }} />
          <span style={{ fontFamily: INTER, fontWeight: 900, fontSize: 108, letterSpacing: '0.01em', color: T.goldHi, ...TNUM }}>
            {TIMER_FINAL}
          </span>
        </div>

        <div
          style={{
            marginTop: 56,
            fontFamily: ANTON,
            fontSize: 116,
            color: T.text0,
            letterSpacing: '0.02em',
            opacity: slam,
            transform: `scale(${1.14 - 0.14 * slam})`,
            textShadow: '0 0 40px rgba(201,165,88,0.25)',
          }}
        >
          UNDER 60 SECONDS.
        </div>
        <div style={{ marginTop: 20, fontFamily: INTER, fontSize: 27, fontWeight: 600, color: T.text3, opacity: subIn }}>
          Priced. Documented. Signed.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
