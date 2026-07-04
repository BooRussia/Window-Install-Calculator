import React from 'react';
import { Composition } from 'remotion';
import { AnchorAd } from './AnchorAd';
import { AnchorLoop } from './AnchorLoop';
import { DURATION } from './timeline';
import { LOOP_DURATION } from './timelineLoop';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="AnchorAd"
        component={AnchorAd}
        durationInFrames={DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="AnchorLoop"
        component={AnchorLoop}
        durationInFrames={LOOP_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
