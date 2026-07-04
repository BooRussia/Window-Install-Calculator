import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { T } from './theme';
import { LSC, LOOP_TIMER_START, LOOP_TIMER_STOP } from './timelineLoop';
import { TimerChip } from './Timer';
import { LoopIntro } from './scenes/LoopIntro';
import { QuoteJourney } from './scenes/QuoteJourney';
import { LoopOutro } from './scenes/LoopOutro';

/**
 * AnchorLoop — a seamless 54s demo for the landing-page embed.
 * intro → the unmodified QuoteJourney → SUBSCRIBE outro, wrapping invisibly
 * (f0 == f1619). The honest stopwatch runs 1:1 over the journey; the outro
 * shows its own big frozen 0:40.4.
 */
export const AnchorLoop: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: T.navy }}>
      <Sequence from={LSC.intro.from} durationInFrames={LSC.intro.to - LSC.intro.from} name="LoopIntro">
        <LoopIntro />
      </Sequence>
      <Sequence from={LSC.journey.from} durationInFrames={LSC.journey.to - LSC.journey.from} name="QuoteJourney">
        <QuoteJourney />
      </Sequence>
      <Sequence from={LSC.outro.from} durationInFrames={LSC.outro.to - LSC.outro.from} name="LoopOutro">
        <LoopOutro />
      </Sequence>

      {/* the honest stopwatch — over the journey only; the outro shows its own big frozen timer */}
      {frame >= LSC.journey.from && frame < LSC.outro.from + 10 ? (
        <TimerChip appearAt={LSC.journey.from + 30} start={LOOP_TIMER_START} stop={LOOP_TIMER_STOP} />
      ) : null}
    </AbsoluteFill>
  );
};
