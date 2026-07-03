import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { T } from './theme';
import { SC } from './timeline';
import { TimerChip } from './Timer';
import { BrandOpen } from './scenes/BrandOpen';
import { QuoteJourney } from './scenes/QuoteJourney';
import { Sync } from './scenes/Sync';
import { TimerPayoff } from './scenes/TimerPayoff';
import { Plans } from './scenes/Plans';
import { EndCard } from './scenes/EndCard';

export const AnchorAd: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: T.navy }}>
      <Sequence from={SC.open.from} durationInFrames={SC.open.to - SC.open.from} name="BrandOpen">
        <BrandOpen />
      </Sequence>
      <Sequence from={SC.journey.from} durationInFrames={SC.journey.to - SC.journey.from} name="QuoteJourney">
        <QuoteJourney />
      </Sequence>
      <Sequence from={SC.sync.from} durationInFrames={SC.sync.to - SC.sync.from} name="Sync">
        <Sync />
      </Sequence>
      <Sequence from={SC.payoff.from} durationInFrames={SC.payoff.to - SC.payoff.from} name="TimerPayoff">
        <TimerPayoff />
      </Sequence>
      <Sequence from={SC.plans.from} durationInFrames={SC.plans.to - SC.plans.from} name="Plans">
        <Plans />
      </Sequence>
      <Sequence from={SC.end.from} durationInFrames={SC.end.to - SC.end.from} name="EndCard">
        <EndCard />
      </Sequence>

      {/* the honest stopwatch — lives above the app world + sync scene */}
      {frame >= SC.journey.from && frame < SC.sync.to ? <TimerChip appearAt={SC.journey.from + 30} /> : null}
    </AbsoluteFill>
  );
};
