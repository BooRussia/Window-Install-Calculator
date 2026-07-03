import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { T, TNUM } from '../theme';
import { ANTON, INTER } from '../fonts';
import { popIn, springIn, win } from '../motion';
import { AppHeader, Card } from '../ui';

/**
 * S8 (local 0–150): desktop + phone side by side; the job syncs across with a
 * gold arc; phone shows the real mobile sticky price bar.
 */
export const Sync: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  const deskIn = springIn(f, fps, 4, 26);
  const phoneIn = springIn(f, fps, 14, 26);
  const arcP = win(f, 40, 62);
  const cardPop = popIn(f, fps, 60);
  const copyIn = springIn(f, fps, 76, 22);
  const subIn = win(f, 92, 106);
  const out = win(f, 134, 150);

  const jobRow = (name: string, value: string, p: number, gold = false) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderRadius: 12,
        background: gold ? 'rgba(181,143,74,0.12)' : 'rgba(15,23,42,0.5)',
        border: `1px solid ${gold ? 'rgba(181,143,74,0.5)' : 'rgba(30,41,59,0.9)'}`,
        marginBottom: 10,
        opacity: p,
        transform: `scale(${0.92 + 0.08 * p})`,
        boxShadow: gold && p > 0.9 ? '0 0 24px -4px rgba(201,165,88,0.45)' : undefined,
      }}
    >
      <span style={{ fontFamily: INTER, fontSize: 14.5, fontWeight: 700, color: T.text2 }}>{name}</span>
      <span style={{ fontFamily: INTER, fontSize: 14.5, fontWeight: 800, color: gold ? T.goldHi : T.text4, ...TNUM }}>
        {value}
      </span>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: T.navy, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: T.bgAmbient }} />
      <AbsoluteFill style={{ opacity: 1 - out, transform: `translateY(${out * 60}px)` }}>
        {/* copy */}
        <div style={{ position: 'absolute', top: 108, left: 0, right: 0, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: ANTON,
              fontSize: 84,
              color: T.text0,
              letterSpacing: '0.02em',
              opacity: copyIn,
              transform: `translateY(${(1 - copyIn) * 30}px)`,
            }}
          >
            YOUR JOBS FOLLOW YOU.
          </div>
          <div style={{ marginTop: 14, fontFamily: INTER, fontSize: 26, fontWeight: 600, color: T.text3, opacity: subIn }}>
            Saved twice — on your device <span style={{ color: T.goldHi }}>and</span> in the cloud.
          </div>
        </div>

        {/* desktop */}
        <div
          style={{
            position: 'absolute',
            left: 250,
            top: 380,
            width: 780,
            transform: `translateX(${(1 - deskIn) * -300}px)`,
            opacity: deskIn,
          }}
        >
          <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(51,65,85,0.7)', boxShadow: '0 40px 90px -30px rgba(0,0,0,0.85)' }}>
            <AppHeader scale={0.9} />
            <div style={{ background: '#050a18', padding: '22px 26px' }}>
              <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: 27, letterSpacing: '-0.03em', color: T.text1 }}>
                Welcome back
              </div>
              <div style={{ fontFamily: INTER, fontSize: 13.5, color: T.text5, marginTop: 4, marginBottom: 18 }}>
                Your pipeline, your jobs, and where your money's going.
              </div>
              <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.text5, marginBottom: 10 }}>
                Recent jobs · by value
              </div>
              {jobRow('Smith Residence', '$23,666', cardPop, true)}
              {jobRow('Hernandez remodel', '$11,480', 1)}
              {jobRow('Palm Bay duplex', '$9,275', 1)}
            </div>
          </div>
        </div>

        {/* phone */}
        <div
          style={{
            position: 'absolute',
            left: 1220,
            top: 330,
            width: 320,
            transform: `translateX(${(1 - phoneIn) * 340}px)`,
            opacity: phoneIn,
          }}
        >
          <div style={{ borderRadius: 38, overflow: 'hidden', border: '2px solid rgba(71,85,105,0.8)', boxShadow: '0 40px 90px -30px rgba(0,0,0,0.9)', background: '#050a18', height: 620, position: 'relative' }}>
            <div style={{ padding: '30px 18px 0' }}>
              <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', color: T.text1 }}>
                Welcome back
              </div>
              <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.text5, margin: '18px 0 10px' }}>
                Recent jobs
              </div>
              {jobRow('Smith Residence', '$23,666', popIn(f, fps, 64), true)}
              {jobRow('Hernandez remodel', '$11,480', 1)}
              {jobRow('Palm Bay duplex', '$9,275', 1)}
              {jobRow('Ortega lanai', '$6,830', 1)}
            </div>
            {/* synced-job bar */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(8,20,42,0.92)',
                borderTop: '1px solid rgba(120,150,200,0.14)',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 700, color: T.text4 }}>Smith Residence</div>
                <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 600, color: T.emerald, opacity: Math.min(1, popIn(f, fps, 66)) }}>
                  ✓ Synced just now
                </div>
              </div>
              <div style={{ fontFamily: INTER, fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: T.text0, ...TNUM }}>
                $23,666
              </div>
            </div>
          </div>
        </div>

        {/* sync arc */}
        <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <path
            d="M1030 500 C 1120 330, 1180 330, 1290 470"
            fill="none"
            stroke={T.goldHi}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="10 12"
            strokeDashoffset={-f * 4}
            opacity={arcP * (1 - out)}
            style={{ filter: 'drop-shadow(0 0 8px rgba(216,185,106,0.8))' }}
          />
          {/* cloud glyph at apex */}
          <g opacity={arcP * (1 - out)} transform="translate(1128,332) scale(1.35)">
            <path
              d="M10 26 a10 10 0 0 1 2-19 a13 13 0 0 1 25-3 a9 9 0 0 1 1 22 z"
              fill="rgba(181,143,74,0.15)"
              stroke={T.goldHi}
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
