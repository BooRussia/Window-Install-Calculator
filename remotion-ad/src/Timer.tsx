import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { T, TNUM } from './theme';
import { INTER } from './fonts';
import { popIn } from './motion';
import { TIMER_START, TIMER_STOP, timerLabel } from './timeline';

/**
 * The honest stopwatch chip — top-right, gold tabular digits.
 * Runs 1:1 with the film from TIMER_START; freezes at TIMER_STOP.
 * `appearAt` is the absolute frame it pops in.
 */
export const TimerChip: React.FC<{ appearAt: number; scale?: number; start?: number; stop?: number }> = ({
  appearAt,
  scale = 1,
  start = TIMER_START,
  stop = TIMER_STOP,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < appearAt) return null;
  const pop = popIn(frame, fps, appearAt);
  const frozen = frame >= stop;
  const running = frame >= start && !frozen;
  return (
    <div
      style={{
        position: 'absolute',
        top: 76 * scale,
        right: 28 * scale,
        zIndex: 60,
        transform: `scale(${pop})`,
        transformOrigin: 'top right',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9 * scale,
          background: 'rgba(15,23,42,0.95)',
          border: `1px solid ${frozen ? T.goldHi : T.gold}`,
          borderRadius: 999,
          padding: `${8 * scale}px ${16 * scale}px`,
          boxShadow: frozen
            ? '0 0 0 4px rgba(201,165,88,0.25), 0 0 22px 4px rgba(201,165,88,0.3)'
            : '0 10px 26px -12px rgba(0,0,0,0.8)',
        }}
      >
        {/* tick dot */}
        <div
          style={{
            width: 8 * scale,
            height: 8 * scale,
            borderRadius: 999,
            background: frozen ? T.emerald : T.goldHi,
            opacity: running ? (Math.floor(frame / 15) % 2 === 0 ? 1 : 0.35) : 1,
          }}
        />
        <span
          style={{
            fontFamily: INTER,
            fontWeight: 800,
            fontSize: 19 * scale,
            letterSpacing: '0.02em',
            color: T.goldHi,
            ...TNUM,
          }}
        >
          {timerLabel(frame, start, stop)}
        </span>
      </div>
    </div>
  );
};
