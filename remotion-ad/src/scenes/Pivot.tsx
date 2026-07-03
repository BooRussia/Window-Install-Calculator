import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { T } from '../theme';
import { ANTON, INTER } from '../fonts';
import { easeOutWin, springIn, win } from '../motion';
import { Wordmark } from '../ui';

/**
 * S3 (local 0–130): the paper world violently crushes into a 2px gold line,
 * the line snaps open (CRT) onto deep navy, and the brand slams in.
 */
export const Pivot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 0–10: paper crush → gold hairline. 10–22: hairline snaps open (CRT reveal).
  const crush = easeOutWin(frame, 0, 10);
  const open = easeOutWin(frame, 12, 24);
  const wash = win(frame, 14, 54);

  const headline = 'KILL THE CLIPBOARD.';
  const wordmarkP = springIn(frame, fps, 62, 26);
  const tagP = win(frame, 84, 100);
  const exitP = easeOutWin(frame, 112, 130); // compress upward into the app world

  return (
    <AbsoluteFill style={{ background: T.navy, overflow: 'hidden' }}>
      {/* gold ambient wash blooming */}
      <AbsoluteFill style={{ background: T.heroAmbient, opacity: wash }} />

      {/* content (revealed by the CRT slit) */}
      <AbsoluteFill
        style={{
          clipPath: `inset(${50 - open * 50}% 0 ${50 - open * 50}% 0)`,
          justifyContent: 'center',
          alignItems: 'center',
          transform: `translateY(${-exitP * 60}px)`,
          opacity: 1 - exitP * 0.9,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: ANTON, fontSize: 128, color: T.text0, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
            {headline.split('').map((ch, i) => {
              const p = springIn(frame, fps, 26 + i * 1.6, 18);
              const isPeriod = i === headline.length - 1;
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    transform: `translateY(${(1 - p) * 34}px)`,
                    opacity: p,
                    color: isPeriod ? T.goldHi : undefined,
                    textShadow: isPeriod && p > 0.9 ? '0 0 22px rgba(216,185,106,0.6)' : undefined,
                  }}
                >
                  {ch === ' ' ? ' ' : ch}
                </span>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 54,
              display: 'flex',
              justifyContent: 'center',
              transform: `scale(${0.9 + 0.1 * wordmarkP})`,
              opacity: wordmarkP,
            }}
          >
            <Wordmark height={76} draw={wordmarkP} />
          </div>
          <div style={{ marginTop: 30, fontFamily: INTER, fontSize: 27, fontWeight: 600, color: T.text4, opacity: tagP }}>
            Anchor your <span style={{ color: T.goldHi }}>profit</span>. Reel in your{' '}
            <span style={{ color: T.goldHi }}>time</span>.
          </div>
        </div>
      </AbsoluteFill>

      {/* the 2px gold line (the slit edges while opening) */}
      {open < 1 ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${50 - open * 50}%`,
              height: 2.5,
              background: 'linear-gradient(90deg, transparent, #dfc07a 12%, #dfc07a 88%, transparent)',
              boxShadow: '0 0 10px 2px rgba(216,185,106,0.9), 0 0 30px 6px rgba(181,143,74,0.55)',
              opacity: crush,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${50 + open * 50}%`,
              height: 2.5,
              background: 'linear-gradient(90deg, transparent, #dfc07a 12%, #dfc07a 88%, transparent)',
              boxShadow: '0 0 10px 2px rgba(216,185,106,0.9), 0 0 30px 6px rgba(181,143,74,0.55)',
              opacity: crush,
            }}
          />
        </>
      ) : null}

      {/* paper remnant crushing away */}
      {crush < 1 ? (
        <AbsoluteFill
          style={{
            background: '#ede8de',
            transform: `scaleY(${1 - crush * 0.995})`,
            transformOrigin: 'center',
            opacity: 1 - crush * 0.35,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
