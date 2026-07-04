import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { T } from '../theme';
import { INTER } from '../fonts';
import { win } from '../motion';
import { Eyebrow } from '../ui';

/**
 * Loop intro (local 0–70). Opens on the EXACT seam state — navy + heroAmbient
 * at opacity 0.45, nothing else — that LoopOutro fades back to, so the wrap is
 * invisible. Then a "LIVE DEMO" eyebrow + one headline rise in and lift away
 * clean before the journey begins.
 */
export const LoopIntro: React.FC = () => {
  const f = useCurrentFrame();

  const eyebrowIn = win(f, 6, 20);
  const headIn = win(f, 18, 36);
  const out = win(f, 54, 70); // both exit upward, fade

  return (
    <AbsoluteFill style={{ background: T.navy, overflow: 'hidden' }}>
      {/* seam layer — matches LoopOutro's resting state exactly */}
      <AbsoluteFill style={{ background: T.heroAmbient, opacity: 0.45 }} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          opacity: 1 - out,
          transform: `translateY(${-out * 30}px)`,
        }}
      >
        <div
          style={{
            opacity: eyebrowIn,
            transform: `translateY(${(1 - eyebrowIn) * 18}px)`,
          }}
        >
          <Eyebrow scale={1.3}>Live Demo</Eyebrow>
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: INTER,
            fontWeight: 800,
            fontSize: 44,
            letterSpacing: '-0.02em',
            color: T.text1,
            textAlign: 'center',
            lineHeight: 1.15,
            opacity: headIn,
            transform: `translateY(${(1 - headIn) * 20}px)`,
          }}
        >
          One real job. Watch the clock.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
