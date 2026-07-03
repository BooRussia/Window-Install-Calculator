import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { T } from '../theme';
import { ANTON, INTER } from '../fonts';
import { easeOutWin, popIn, springIn, win } from '../motion';
import { AnchorGlyph, GoldButton } from '../ui';

/**
 * S11 (local 0–180): anchor draws itself, the vow returns, CTA breathes,
 * the scroll-cue line pulses us out.
 */
export const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const draw = easeOutWin(f, 4, 40);
  const line1 = springIn(f, fps, 34, 22);
  const line2 = springIn(f, fps, 48, 22);
  const ctaIn = popIn(f, fps, 74);
  const urlIn = win(f, 92, 112);
  const chipsIn = win(f, 112, 128);
  const fadeOut = win(f, 168, 180);

  // breathing CTA glow (2.4s period — the scroll cue's loop)
  const breathe = 0.5 + 0.5 * Math.sin((f / 72) * Math.PI * 2);
  // scroll-cue drain/refill line
  const cueT = (f % 72) / 72;
  const cueScale = cueT < 0.5 ? 1 - cueT * 2 : (cueT - 0.5) * 2;
  const cueOrigin = cueT < 0.5 ? 'bottom' : 'top';

  // URL letters
  const url = 'ANCHORQUOTING.COM';

  return (
    <AbsoluteFill style={{ background: T.navy, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: T.heroAmbient, opacity: 0.5 + breathe * 0.25 }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 1 - fadeOut }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <AnchorGlyph size={110} draw={draw} glow strokeWidth={8} />
          <span
            style={{
              fontFamily: INTER,
              fontWeight: 800,
              fontSize: 88,
              letterSpacing: '-0.045em',
              color: T.text1,
              opacity: win(f, 26, 42),
              lineHeight: 1,
            }}
          >
            Anchor
          </span>
        </div>

        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: ANTON,
              fontSize: 96,
              color: T.text0,
              letterSpacing: '0.02em',
              lineHeight: 1.1,
              opacity: line1,
              transform: `translateY(${(1 - line1) * 30}px)`,
            }}
          >
            ANCHOR YOUR PROFIT.
          </div>
          <div
            style={{
              fontFamily: ANTON,
              fontSize: 96,
              letterSpacing: '0.02em',
              lineHeight: 1.1,
              background: T.goldTextGrad,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              opacity: line2,
              transform: `translateY(${(1 - line2) * 30}px)`,
              filter: 'drop-shadow(0 0 24px rgba(216,185,106,0.3))',
            }}
          >
            REEL IN YOUR TIME.
          </div>
        </div>

        <div style={{ marginTop: 52, transform: `scale(${ctaIn})`, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              inset: -6,
              borderRadius: 999,
              boxShadow: `0 10px ${34 + breathe * 22}px -8px rgba(181,143,74,${0.45 + breathe * 0.3})`,
            }}
          />
          <GoldButton scale={1.45}>Get Started Free</GoldButton>
        </div>

        <div style={{ marginTop: 40, display: 'flex', gap: 3 }}>
          {url.split('').map((ch, i) => (
            <span
              key={i}
              style={{
                fontFamily: ANTON,
                fontSize: 34,
                letterSpacing: '0.24em',
                color: 'rgba(216,185,106,0.92)',
                textShadow: '0 0 10px rgba(216,185,106,0.4), 0 0 22px rgba(181,143,74,0.3)',
                opacity: interpolate(f, [92 + i * 1.5, 100 + i * 1.5], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              {ch}
            </span>
          ))}
        </div>

        <div
          style={{
            marginTop: 34,
            fontFamily: INTER,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: T.text4,
            opacity: chipsIn,
          }}
        >
          14-day free trial · No credit card · Encrypted · US-hosted
        </div>
      </AbsoluteFill>

      {/* the scroll-cue line, bottom-right — brand heartbeat out */}
      <div style={{ position: 'absolute', right: 66, bottom: 48, opacity: (1 - fadeOut) * win(f, 60, 80) }}>
        <div
          style={{
            fontFamily: ANTON,
            fontSize: 17,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'rgba(216,185,106,0.92)',
            textShadow: '0 0 10px rgba(216,185,106,0.4)',
            writingMode: 'vertical-rl',
            marginBottom: 12,
            opacity: 0.55 + 0.45 * breathe,
          }}
        >
          Start
        </div>
        <div
          style={{
            width: 2,
            height: 120,
            margin: '10px auto 0',
            background: T.gold,
            filter: 'drop-shadow(0 0 5px rgba(216,185,106,0.9)) drop-shadow(0 0 12px rgba(181,143,74,0.55))',
            transform: `scaleY(${cueScale})`,
            transformOrigin: cueOrigin,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
