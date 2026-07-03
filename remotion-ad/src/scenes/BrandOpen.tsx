import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { T } from '../theme';
import { INTER } from '../fonts';
import { easeOutWin, springIn, win } from '../motion';
import { Wordmark } from '../ui';

/**
 * S1 (local 0–200, ~6.7s): the clean brand open.
 * Gold anchor draws itself in on navy, the wordmark resolves, the real tagline
 * rises, one product line lands — then it lifts away as the app assembles.
 * Inter throughout (no heavy display type here); premium and calm.
 */
export const BrandOpen: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wash = win(f, 6, 46);
  const draw = easeOutWin(f, 10, 58); // anchor strokes draw on
  const textOp = win(f, 46, 72); // wordmark text resolves
  const line1 = springIn(f, fps, 84, 22);
  const line2 = springIn(f, fps, 98, 22);
  const descIn = win(f, 126, 146);
  const out = win(f, 172, 200); // lift + fade to hand off to the app
  const breathe = 0.5 + 0.5 * Math.sin((f / 72) * Math.PI * 2);

  return (
    <AbsoluteFill style={{ background: T.navy, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: T.heroAmbient, opacity: 0.4 + wash * 0.35 + breathe * 0.14 }} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          opacity: 1 - out,
          transform: `translateY(${-out * 44}px) scale(${1 - out * 0.04})`,
        }}
      >
        {/* wordmark lockup — gold glyph draws in, then "Anchor" resolves */}
        <div style={{ transform: `scale(${0.94 + 0.06 * draw})` }}>
          <Wordmark height={104} draw={draw} textOpacity={textOp} />
        </div>

        {/* tagline — real brand copy, two centered lines */}
        <div style={{ marginTop: 52, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: INTER,
              fontWeight: 700,
              fontSize: 46,
              letterSpacing: '-0.02em',
              color: T.text1,
              opacity: line1,
              transform: `translateY(${(1 - line1) * 22}px)`,
              lineHeight: 1.18,
            }}
          >
            Anchor your profit.
          </div>
          <div
            style={{
              fontFamily: INTER,
              fontWeight: 700,
              fontSize: 46,
              letterSpacing: '-0.02em',
              color: T.goldHi,
              opacity: line2,
              transform: `translateY(${(1 - line2) * 22}px)`,
              lineHeight: 1.18,
              textShadow: '0 0 26px rgba(201,165,88,0.28)',
            }}
          >
            Reel in your time.
          </div>
        </div>

        {/* one product line */}
        <div
          style={{
            marginTop: 30,
            fontFamily: INTER,
            fontSize: 21,
            fontWeight: 500,
            color: T.text4,
            opacity: descIn,
            letterSpacing: '0.01em',
          }}
        >
          Window &amp; door quotes, priced to the foot — in under a minute.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
