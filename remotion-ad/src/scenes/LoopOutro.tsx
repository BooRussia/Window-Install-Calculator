import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { T, TNUM } from '../theme';
import { ANTON, INTER } from '../fonts';
import { popIn, springIn, win } from '../motion';
import { GoldButton } from '../ui';
import { TIMER_FINAL } from '../timeline';

/**
 * Loop outro (local 0–270). Models TimerPayoff + EndCard's language but with the
 * SUBSCRIBE narrative — the viewer is already on the site, so the beat is:
 * proof (frozen 0:40.4) → "UNDER 60 SECONDS." → start the free trial.
 *
 * SEAM: by local 256 all content is gone and the ambient has eased back to
 * exactly 0.45, matching LoopIntro frame 0. Holds that state 256–270.
 */
export const LoopOutro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 0–14: dark veil fades over the journey's last frame.
  const veil = win(f, 0, 14);
  // 8: frozen stopwatch springs to center, big, with a ring shockwave.
  const land = springIn(f, fps, 8, 22);
  const ring = win(f, 8, 34);
  // 30 / 44: headline + sub.
  const slam = springIn(f, fps, 30, 20);
  const subIn = win(f, 44, 60);
  // 66: timer+headline block compresses up; conversion block springs in.
  const lift = win(f, 66, 92);
  const ctaIn = popIn(f, fps, 72);
  const factsIn = win(f, 84, 104);
  // 200–256: everything fades out; ambient eases back to the seam value (0.45).
  const out = win(f, 200, 256);

  // breathing CTA glow (2.4s period @ 30fps = 72 frames)
  const breathe = 0.5 + 0.5 * Math.sin((f / 72) * Math.PI * 2);

  // ambient: extra boost during the payoff, eased back to exactly 0.45 by local 256.
  const ambientBoost = win(f, 0, 30) * 0.22 * (1 - out);
  const ambientOpacity = 0.45 + ambientBoost;

  // the whole content column, faded out by 256
  const contentOpacity = 1 - out;

  return (
    <AbsoluteFill style={{ background: T.navy, overflow: 'hidden' }}>
      {/* veil that lands over the app, then the persistent seam ambient */}
      <AbsoluteFill style={{ background: T.navy, opacity: veil }} />
      <AbsoluteFill style={{ background: T.heroAmbient, opacity: ambientOpacity }} />

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          opacity: contentOpacity,
        }}
      >
        {/* proof + headline block — compresses up to make room for the CTA */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            transform: `translateY(${-lift * 40}px) scale(${1 - lift * 0.08})`,
          }}
        >
          {/* ring shockwave */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            {ring > 0 && ring < 1 ? (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 360 + ring * 560,
                  height: 360 + ring * 560,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: 999,
                  border: `3px solid rgba(201,165,88,${0.85 * (1 - ring)})`,
                  boxShadow: `0 0 ${40 * (1 - ring)}px rgba(201,165,88,${0.5 * (1 - ring)})`,
                }}
              />
            ) : null}

            {/* frozen stopwatch, huge (~3x the HUD size) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                background: 'rgba(15,23,42,0.95)',
                border: `2px solid ${T.goldHi}`,
                borderRadius: 999,
                padding: '22px 52px',
                boxShadow:
                  '0 0 0 8px rgba(201,165,88,0.18), 0 0 60px 8px rgba(201,165,88,0.28), 0 40px 90px -30px rgba(0,0,0,0.9)',
                transform: `scale(${0.5 + 0.5 * land})`,
                opacity: land,
              }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 999, background: T.emerald }} />
              <span
                style={{
                  fontFamily: INTER,
                  fontWeight: 900,
                  fontSize: 92,
                  letterSpacing: '0.01em',
                  color: T.goldHi,
                  ...TNUM,
                }}
              >
                {TIMER_FINAL}
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: 44,
              fontFamily: ANTON,
              fontSize: 90,
              color: T.text0,
              letterSpacing: '0.02em',
              textAlign: 'center',
              opacity: slam,
              transform: `scale(${1.12 - 0.12 * slam})`,
              textShadow: '0 0 40px rgba(201,165,88,0.25)',
            }}
          >
            UNDER 60 SECONDS.
          </div>
          <div
            style={{
              marginTop: 16,
              fontFamily: INTER,
              fontSize: 22,
              fontWeight: 600,
              color: T.text4,
              opacity: subIn,
            }}
          >
            Priced. Documented. Signed.
          </div>
        </div>

        {/* conversion block — CTA + verified trial facts */}
        <div
          style={{
            marginTop: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            opacity: ctaIn,
            transform: `translateY(${(1 - lift) * 30}px)`,
          }}
        >
          <div style={{ transform: `scale(${ctaIn})`, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                inset: -6,
                borderRadius: 999,
                boxShadow: `0 10px ${34 + breathe * 22}px -8px rgba(181,143,74,${0.45 + breathe * 0.3})`,
              }}
            />
            <GoldButton scale={1.25}>Start your free trial</GoldButton>
          </div>
          <div
            style={{
              marginTop: 22,
              fontFamily: INTER,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: T.text4,
              textAlign: 'center',
              opacity: factsIn,
            }}
          >
            14-DAY TRIAL · FULL PRO ACCESS · 8 QUOTES · NO CARD REQUIRED
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
