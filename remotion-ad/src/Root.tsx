import React from 'react';
import { Composition } from 'remotion';
import { AnchorAd } from './AnchorAd';
import { DURATION } from './timeline';

export const Root: React.FC = () => {
  return (
    <Composition
      id="AnchorAd"
      component={AnchorAd}
      durationInFrames={DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
