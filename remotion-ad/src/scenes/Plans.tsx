import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { T, TNUM } from '../theme';
import { ANTON, INTER } from '../fonts';
import { popIn, springIn, win } from '../motion';
import { Card } from '../ui';

/**
 * S10 (local 0–120): the three real plans, verbatim taglines + one display-size
 * feature line each, then the trial banner.
 */
const TIERS = [
  { name: 'Starter', price: '$39', tag: 'Small shops doing a job or two a month', line: '25 quotes / mo' },
  { name: 'Pro', price: '$99', tag: 'Active contractors quoting every week', line: '100 AI plan reads / mo', popular: true },
  { name: 'Shop', price: '$199', tag: 'High-volume shops and growing teams', line: 'Unlimited quotes' },
];

export const Plans: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headIn = springIn(f, fps, 2, 20);
  const bannerIn = springIn(f, fps, 62, 22);
  const out = win(f, 106, 120);

  return (
    <AbsoluteFill style={{ background: T.navy, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: T.bgAmbient }} />
      <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${1 - out * 0.03})`, justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            top: 96,
            fontFamily: ANTON,
            fontSize: 76,
            color: T.text0,
            letterSpacing: '0.02em',
            opacity: headIn,
            transform: `translateY(${(1 - headIn) * 26}px)`,
          }}
        >
          PICK YOUR VOLUME.
        </div>

        <div style={{ display: 'flex', gap: 26, marginTop: 40 }}>
          {TIERS.map((t, i) => {
            const p = springIn(f, fps, 14 + i * 10, 24);
            const pro = Boolean(t.popular);
            return (
              <Card
                key={t.name}
                style={{
                  width: 400,
                  padding: '34px 36px 30px',
                  opacity: p,
                  transform: `translateY(${(1 - p) * 70 + (pro ? -14 : 0)}px) scale(${pro ? 1.04 : 1})`,
                  borderColor: pro ? 'rgba(181,143,74,0.5)' : undefined,
                  boxShadow: pro ? '0 0 44px -8px rgba(181,143,74,0.35)' : undefined,
                  position: 'relative',
                }}
              >
                {pro ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: -16,
                      left: '50%',
                      transform: `translateX(-50%) scale(${popIn(f, fps, 44)})`,
                      background: 'linear-gradient(180deg,#d8b765,#b58f4a)',
                      color: '#1a1206',
                      fontFamily: INTER,
                      fontSize: 12.5,
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      borderRadius: 999,
                      padding: '6px 18px',
                      boxShadow: '0 6px 18px -6px rgba(181,143,74,0.7)',
                    }}
                  >
                    Most popular
                  </div>
                ) : null}
                <div style={{ fontFamily: INTER, fontSize: 21, fontWeight: 800, color: T.text1 }}>{t.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
                  <span style={{ fontFamily: INTER, fontWeight: 900, fontSize: 64, letterSpacing: '-0.04em', color: T.text0, ...TNUM }}>
                    {t.price}
                  </span>
                  <span style={{ fontFamily: INTER, fontSize: 19, fontWeight: 600, color: T.text5 }}>/mo</span>
                </div>
                <div style={{ fontFamily: INTER, fontSize: 15.5, color: T.text4, marginTop: 10, lineHeight: 1.45, minHeight: 46 }}>
                  {t.tag}
                </div>
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 16,
                    borderTop: '1px solid rgba(30,41,59,0.9)',
                    fontFamily: INTER,
                    fontSize: 21,
                    fontWeight: 800,
                    color: T.goldHi,
                    opacity: win(f, 40 + i * 8, 52 + i * 8),
                    ...TNUM,
                  }}
                >
                  {t.line}
                </div>
              </Card>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 44,
            fontFamily: INTER,
            fontSize: 24,
            fontWeight: 700,
            color: T.goldHi,
            background: T.goldSoft,
            border: '1px solid rgba(181,143,74,0.35)',
            borderRadius: 999,
            padding: '14px 34px',
            opacity: bannerIn,
            transform: `translateY(${(1 - bannerIn) * 26}px)`,
            ...TNUM,
          }}
        >
          14-day free trial · 8 quotes · No credit card required
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
