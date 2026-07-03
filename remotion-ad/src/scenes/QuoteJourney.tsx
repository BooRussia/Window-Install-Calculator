import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { T, TNUM, money } from '../theme';
import { ANTON, INTER } from '../fonts';
import { countUp, easeInOutWin, easeOutWin, popIn, springIn, typed, win } from '../motion';
import { AiBadge, Card, Cursor, GoldButton, Toast, CheckDot } from '../ui';
import {
  AppFrame,
  BreakdownCard,
  BREAKDOWN_ROWS,
  FileCard,
  FILE_CARDS,
  PriceHero,
  QuotePdfPage,
  RailState,
  RecapBand,
} from '../appui';
import { ExtractChip, PlanSheet, ScanBeam } from '../plan';

/* ---------------------------------------------------------------------------
 * S4–S7 (local 0–1280, abs 360–1640): the continuous app world.
 *   SETUP 0–260 · MATH 260–560 · AI 560–990 · DOCS 990–1280
 * ------------------------------------------------------------------------- */

// ---- beat map (local frames). Interactions run strictly top-to-bottom down the
// rail so the cursor never backtracks; each state flip is keyed to the same frame
// the cursor clicks its control (Glass stays on the Florida-default Impact — the
// "everything's pre-set" callout — so it needs no click).
const B = {
  assemble: 0,
  nameFocus: 40, // Job name (y150)
  tapBlock: 104, // House · Block Framed (y533)
  tapStories: 138, // Stories · 2 Story (y630)
  ddOpen: 170, // Manufacturer (y723)
  ddPick: 196, // Manufacturer · Viwinco
  lfFocus: 232, // LF input (y870)
  key1: 246, // "2"    → $153.50
  key2: 266, // "24"   → $1,842.00
  key3: 286, // "240"  → $18,419.40
  windows: 322, // Windows pill (y1036)
  cards: 382,
  bdIn: 412,
  bdRows: 424, // rows cascade start
  bdTotal: 520,
  aiDim: 560,
  uploadClick: 590,
  modalIn: 600,
  sheetIn: 640,
  choosePress: 664,
  modalOut: 676,
  status1: 684, // Preparing…
  status2: 718, // Rendering plan pages…
  status3: 752, // Reading 12 pages with AI…
  scanStart: 726,
  scanEnd: 852,
  hit: 868,
  toastIn: 878, // Applied toast — holds 80f
  goldCascade: 886,
  priceBridge: 948, // $18,419.40 → $23,666.00
  popover: 964,
  flCard: 986,
  usedToast: 1000,
  savePress: 1014,
  savedToast: 1024,
  filesIn: 1052,
  viewClick: 1108,
  pdfIn: 1118,
  pdfBuilt: 1220, // == TIMER_STOP (abs 1580)
  signDraw: 1226,
  approved: 1252,
} as const;

const SELL_1 = 18419.4;
const SELL_2 = 23666;
const COST_1 = 13644;
const COST_2 = 17530.37;

// ---- cursor waypoints {frame, x, y, click?}
// Coordinates are the real on-screen field centers at scrollY=0 (verified against
// rendered stills). The rail does NOT scroll during the tap sequence, so a field
// never moves out from under the cursor — every click lands on its own control.
type Waypoint = { f: number; x: number; y: number; click?: boolean };
const WAYPOINTS: Waypoint[] = [
  { f: 0, x: 1400, y: 880 },
  { f: B.nameFocus - 8, x: 210, y: 150 },
  { f: B.nameFocus, x: 210, y: 150, click: true }, // Job name
  { f: B.nameFocus + 34, x: 210, y: 150 }, // dwell through typing
  { f: B.tapBlock - 10, x: 84, y: 533 },
  { f: B.tapBlock, x: 84, y: 533, click: true }, // House · Block Framed
  { f: B.tapStories - 10, x: 135, y: 630 },
  { f: B.tapStories, x: 135, y: 630, click: true }, // Stories · 2 Story
  { f: B.ddOpen - 10, x: 210, y: 723 },
  { f: B.ddOpen, x: 210, y: 723, click: true }, // Manufacturer (open)
  { f: B.ddPick, x: 210, y: 723, click: true }, // Manufacturer · Viwinco
  { f: B.lfFocus - 10, x: 210, y: 870 },
  { f: B.lfFocus, x: 210, y: 870, click: true }, // LF input
  { f: B.key3 + 8, x: 210, y: 870 }, // dwell through typing
  { f: B.windows - 8, x: 124, y: 1036 },
  { f: B.windows, x: 124, y: 1036, click: true }, // Windows pill
  { f: B.aiDim - 14, x: 210, y: 241 }, // drift up to the AI upload button
  { f: B.uploadClick - 8, x: 210, y: 241 },
  { f: B.uploadClick, x: 210, y: 241, click: true }, // Upload Window Schedule
  { f: B.choosePress - 10, x: 960, y: 606 },
  { f: B.choosePress, x: 960, y: 606, click: true }, // Choose plan file (modal)
  { f: B.choosePress + 16, x: 1320, y: 820 }, // away for the scan
  { f: B.savePress - 12, x: 1770, y: 1008 },
  { f: B.savePress, x: 1770, y: 1008, click: true }, // Save job FAB
  { f: B.viewClick - 10, x: 805, y: 405 },
  { f: B.viewClick, x: 805, y: 405, click: true }, // View · Customer Quote card
  { f: B.viewClick + 16, x: 1200, y: 620 },
];

const cursorAt = (f: number) => {
  let a = WAYPOINTS[0];
  let b = WAYPOINTS[WAYPOINTS.length - 1];
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    if (f >= WAYPOINTS[i].f && f <= WAYPOINTS[i + 1].f) {
      a = WAYPOINTS[i];
      b = WAYPOINTS[i + 1];
      break;
    }
  }
  if (f >= WAYPOINTS[WAYPOINTS.length - 1].f) return { x: b.x, y: b.y };
  if (f <= WAYPOINTS[0].f) return { x: a.x, y: a.y };
  const t = easeInOutWin(f, a.f, b.f);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};

const clickPulse = (f: number) => {
  for (const w of WAYPOINTS) {
    if (w.click && f >= w.f && f < w.f + 12) return (f - w.f) / 12;
  }
  return 0;
};

// keystroke pulse helper for the price
const pulseAt = (f: number, at: number, dur = 14) =>
  f >= at && f < at + dur ? (f - at) / dur : 0;

const AntonOverlay: React.FC<{
  lines: string[];
  from: number;
  to: number;
  frame: number;
  fps: number;
  sub?: string;
  x?: number;
  y?: number;
  size?: number;
  scrim?: boolean;
}> = ({ lines, from, to, frame, fps, sub, x = 520, y = 806, size = 72, scrim = false }) => {
  if (frame < from || frame > to + 14) return null;
  const out = easeOutWin(frame, to, to + 12);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: 40,
        opacity: 1 - out,
        transform: `translateY(${out * 26}px)`,
        ...(scrim
          ? {
              background: 'rgba(2,6,23,0.82)',
              borderRadius: 18,
              padding: '18px 28px',
              backdropFilter: 'blur(6px)',
            }
          : {}),
      }}
    >
      {lines.map((l, i) => {
        const p = springIn(frame, fps, from + i * 12, 20);
        return (
          <div
            key={l}
            style={{
              fontFamily: ANTON,
              fontSize: size,
              color: i === lines.length - 1 && lines.length > 1 ? T.goldHi : T.text0,
              letterSpacing: '0.02em',
              lineHeight: 1.12,
              opacity: p,
              transform: `translateY(${(1 - p) * 30}px)`,
              textShadow: '0 4px 30px rgba(2,6,23,0.9)',
            }}
          >
            {l}
          </div>
        );
      })}
      {sub ? (
        <div
          style={{
            marginTop: 12,
            fontFamily: INTER,
            fontSize: 25,
            fontWeight: 600,
            color: T.text3,
            opacity: win(frame, from + lines.length * 12 + 6, from + lines.length * 12 + 20),
            textShadow: '0 3px 20px rgba(2,6,23,0.9)',
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};

export const QuoteJourney: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ---------------- rail state ---------------- */
  const jobName = typed('Smith Residence', f, B.nameFocus + 6, 0.75);
  const lfStr =
    f < B.key1 ? '' : f < B.key2 ? '2' : f < B.key3 ? '24' : '240';
  const aiGlow = win(f, B.goldCascade, B.goldCascade + 46);
  const upStatus =
    f >= B.status1 && f < B.status2
      ? 'Preparing…'
      : f >= B.status2 && f < B.status3
        ? 'Rendering plan pages…'
        : f >= B.status3 && f < B.hit
          ? 'Reading 12 pages with AI…'
          : null;

  const rail: RailState = {
    jobName,
    jobNameCaret: f >= B.nameFocus && f < B.tapBlock - 10,
    uploadStatus: upStatus,
    spinnerAngle: (f * 14) % 360,
    uploadPressed: f >= B.uploadClick && f < B.uploadClick + 8,
    construction: 0,
    house: f >= B.tapBlock ? 0 : 1,
    stories: f >= B.tapStories ? 1 : 0,
    manufacturer: f >= B.ddPick ? 'Viwinco' : undefined,
    lf: lfStr,
    lfCaret: f >= B.lfFocus && f < B.windows - 4,
    lfHint: f >= B.windows + 14 ? '≈ 8.9 LF / window' : undefined,
    glass: 0, // Impact — pre-set Florida default (no click needed)
    windows: f >= B.windows + 6 ? '27' : '0',
    doorsSummary: f >= B.goldCascade + 30 ? '1 door · 3 panels · 12 LF' : undefined,
    aiGlow,
    // The rail is locked at scrollY=0 through the whole tap sequence (all fields
    // fit in frame), so clicks never miss. It only nudges up once the AI badges
    // add height, to keep the WINDOWS row visible — and no clicking happens then.
    scrollY: interpolate(f, [B.goldCascade + 10, B.goldCascade + 34], [0, 52], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  };

  /* ---------------- price math ---------------- */
  let price = 0;
  price = countUp(f, 0, 153.5, B.key1, B.key1 + 10);
  if (f >= B.key2) price = countUp(f, 153.5, 1842, B.key2, B.key2 + 10);
  if (f >= B.key3) price = countUp(f, 1842, SELL_1, B.key3, B.key3 + 14);
  if (f >= B.priceBridge) price = countUp(f, SELL_1, SELL_2, B.priceBridge, B.priceBridge + 30);
  const cost = price / 1.35;
  const profit = price - cost;
  const pricePulse =
    pulseAt(f, B.key1) ||
    pulseAt(f, B.key2) ||
    pulseAt(f, B.key3) ||
    pulseAt(f, B.windows + 6) ||
    pulseAt(f, B.priceBridge + 10) ||
    pulseAt(f, B.priceBridge + 30);

  /* ---------------- stage phases ---------------- */
  const emptyP = 1 - win(f, B.key1 - 8, B.key1 + 4);
  const mathP = win(f, B.key1 - 2, B.key1 + 10) * (1 - win(f, B.hit - 40, B.hit - 16));
  // plan scan visibility
  const planP = win(f, B.status1 + 8, B.status1 + 26) * (1 - win(f, B.hit, B.hit + 12));
  // post-AI: back to price + FL card
  const postAiP = win(f, B.toastIn, B.toastIn + 16) * (1 - win(f, B.filesIn - 16, B.filesIn - 2));
  const filesP = win(f, B.filesIn - 4, B.filesIn + 8) * (1 - win(f, B.pdfIn + 4, B.pdfIn + 18));
  const pdfP = win(f, B.pdfIn, B.pdfIn + 22);

  // dim the stage while the modal + plan scan own the frame; restore on the hit
  const stageDim = 1 - 0.88 * win(f, B.aiDim, B.aiDim + 16) + 0.88 * win(f, B.hit, B.hit + 14);

  /* camera: locked off — element motion carries the energy, nothing crops */
  const camScale = 1;
  const camX = 0;

  /* assembling entrance */
  const asmHeader = springIn(f, fps, 2, 22);
  const asmRail = springIn(f, fps, 10, 24);
  const asmStage = win(f, 22, 44);

  const modalP = springIn(f, fps, B.modalIn, 14) * (1 - easeOutWin(f, B.modalOut, B.modalOut + 10));
  const sheetFly = springIn(f, fps, B.sheetIn, 24);

  const scanP = win(f, B.scanStart, B.scanEnd);
  const rowHi = interpolate(f, [B.scanStart + 14, B.scanEnd], [0, 6.6], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const hitFlash = f >= B.hit && f < B.hit + 5 ? 1 - (f - B.hit) / 5 : 0;

  const cur = cursorAt(f);
  const click = clickPulse(f);

  /* recap tokens */
  const specTokens: [string, number][] = [
    ['New', B.tapBlock + 4],
    ['Block', B.tapBlock + 4],
    ['Impact', B.tapStories + 4],
    ['Viwinco', B.ddPick + 6],
    ['Nail-fin', B.ddPick + 6],
  ];
  const spec = specTokens.filter(([, at]) => f >= at).map(([t]) => t).join(' · ');
  const sizeLine =
    f >= B.goldCascade + 34
      ? '240 LF · 27 windows · 2-story · 1 door'
      : f >= B.windows + 10
        ? '240 LF · 27 windows · 2-story'
        : f >= B.key3 + 6
          ? '240 LF · 2-story'
          : '';

  return (
    <AbsoluteFill style={{ background: T.navy }}>
      {/* app world w/ camera */}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${camScale}) translateX(${camX}px)` }}>
        <div style={{ opacity: asmStage < 1 ? 0.999 : 1 }}>
          {/* header + rail assemble via clip/translate */}
          <div style={{ transform: `translateY(${(1 - asmHeader) * -60}px)` }}>
            <div style={{ transform: `translateX(${(1 - asmRail) * -430}px)`, position: 'absolute', inset: 0 }} />
          </div>
          <AppFrame rail={rail}>
            {/* ---------- STAGE ---------- */}
            <div style={{ position: 'absolute', inset: 0, opacity: Math.min(asmStage, stageDim) }}>
              {/* recap band */}
              {sizeLine || spec ? (
                <div style={{ position: 'absolute', top: 26, left: 0, right: 0 }}>
                  <RecapBand size={sizeLine || ' '} spec={spec} />
                </div>
              ) : null}

              {/* EMPTY STATE */}
              {emptyP > 0.01 ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: emptyP * asmStage }}>
                  <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: 46, letterSpacing: '-0.04em', color: T.text1 }}>
                    Get an instant price
                  </div>
                  <div style={{ fontFamily: INTER, fontSize: 18, color: T.text4, marginTop: 12, maxWidth: 620, textAlign: 'center', lineHeight: 1.5 }}>
                    Tap a sample job below to fill it in instantly — or enter your own in a few{' '}taps.
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
                    {['240 ft · Concrete block · Impact glass · 2-story', '180 ft · Wood frame · Standard glass · 1-story'].map((c) => (
                      <div key={c} style={{ fontFamily: INTER, fontSize: 13.5, fontWeight: 700, color: T.goldHi, border: '1px solid rgba(181,143,74,0.45)', background: T.goldSoft, borderRadius: 999, padding: '9px 18px', ...TNUM }}>
                        {c}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 22, fontFamily: INTER, fontSize: 15, fontWeight: 600, color: T.text4 }}>
                    ✨ Or use AI to skip typing
                  </div>
                </div>
              ) : null}

              {/* MATH STAGE */}
              {mathP > 0.01 ? (
                <div style={{ position: 'absolute', inset: 0, opacity: mathP }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: interpolate(f, [B.bdIn, B.bdIn + 30], [270, 96], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <PriceHero price={price} cost={f >= B.cards ? COST_1 : cost} profit={f >= B.cards ? SELL_1 - COST_1 : profit} pulse={pricePulse} size={interpolate(f, [B.bdIn, B.bdIn + 30], [124, 88], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
                  </div>
                  {/* stat cards + breakdown */}
                  {f >= B.bdIn ? (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 420, display: 'flex', justifyContent: 'center' }}>
                      <div
                        style={{
                          transform: `translateY(${(1 - springIn(f, fps, B.bdIn, 24)) * 60}px)`,
                          opacity: springIn(f, fps, B.bdIn, 24),
                          // grow the card with the row cascade so it never sits mostly empty
                          clipPath: `inset(0 0 ${(1 - win(f, B.bdRows, B.bdRows + 96)) * 52}% 0 round 16px)`,
                        }}
                      >
                        <BreakdownCard
                          rowsVisible={interpolate(f, [B.bdRows, B.bdRows + 88], [0, 9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
                          perLf="$56.85"
                          perLfP={popIn(f, fps, B.bdRows + 20)}
                          grandTotal="$13,644.00"
                          totalP={win(f, B.bdTotal, B.bdTotal + 12)}
                          width={920}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* POST-AI STAGE (price bridge + FL approvals) */}
              {postAiP > 0.01 ? (
                <div style={{ position: 'absolute', inset: 0, opacity: postAiP }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 210, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <PriceHero price={price} cost={price / 1.35} profit={price - price / 1.35} pulse={pricePulse} size={116} />
                    <div
                      style={{
                        marginTop: 22,
                        fontFamily: INTER,
                        fontSize: 27,
                        fontWeight: 700,
                        color: T.goldHi,
                        opacity: win(f, B.priceBridge + 26, B.priceBridge + 40),
                      }}
                    >
                      The stuff you'd forget — counted.
                    </div>
                  </div>
                  {/* FL approvals + cut list chips */}
                  {f >= B.flCard ? (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 700, display: 'flex', justifyContent: 'center', gap: 16 }}>
                      <Card style={{ padding: '18px 24px', opacity: popIn(f, fps, B.flCard), transform: `scale(${0.9 + 0.1 * popIn(f, fps, B.flCard)})` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ fontFamily: INTER, fontSize: 16, fontWeight: 700, color: T.text1 }}>Florida Product Approvals</span>
                          <AiBadge />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {['FL# 17894.3', 'FL# 22065.1', 'FL# 41219.2'].map((n, i) => (
                            <span key={n} style={{ fontFamily: INTER, fontSize: 13.5, fontWeight: 800, color: T.goldHi, border: '1px solid rgba(181,143,74,0.45)', background: T.goldSoft, borderRadius: 999, padding: '6px 14px', opacity: popIn(f, fps, B.flCard + 6 + i * 5), ...TNUM }}>
                              {n}
                            </span>
                          ))}
                        </div>
                      </Card>
                      <Card style={{ padding: '18px 24px', opacity: popIn(f, fps, B.flCard + 10), transform: `scale(${0.9 + 0.1 * popIn(f, fps, B.flCard + 10)})` }}>
                        <div style={{ fontFamily: INTER, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.emerald, marginBottom: 10 }}>
                          Cut list ready
                        </div>
                        <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: T.text2, ...TNUM }}>
                          48 boards · least-waste plan
                        </div>
                      </Card>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* SAVE JOB FAB (the app's gold #jobSpecsFab skin) */}
              {f >= B.priceBridge - 6 && f < B.savePress + 16 ? (
                <div
                  style={{
                    position: 'absolute',
                    right: 70,
                    bottom: 46,
                    background: '#c9a558',
                    border: '1px solid #b58f4a',
                    color: '#0b1020',
                    borderRadius: 999,
                    padding: '14px 22px',
                    fontFamily: INTER,
                    fontSize: 13.5,
                    fontWeight: 800,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    boxShadow: '0 14px 28px -10px rgba(0,0,0,0.55), 0 2px 6px -2px rgba(181,143,74,0.55)',
                    opacity: popIn(f, fps, B.priceBridge - 6),
                    transform: `scale(${f >= B.savePress && f < B.savePress + 8 ? 0.96 : Math.min(1, popIn(f, fps, B.priceBridge - 6))})`,
                  }}
                >
                  Save job
                </div>
              ) : null}

              {/* FILES STAGE */}
              {filesP > 0.01 ? (
                <div style={{ position: 'absolute', inset: 0, opacity: filesP }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 180, textAlign: 'center' }}>
                    <div style={{ fontFamily: INTER, fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.text5 }}>
                      Job files — Smith Residence
                    </div>
                  </div>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 240, display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap', padding: '0 120px' }}>
                    {FILE_CARDS.map((c, i) => (
                      <div key={c.name} style={{ position: 'relative' }}>
                        <FileCard name={c.name} desc={c.desc} p={springIn(f, fps, B.filesIn + i * 10, 24)} width={310} highlight={i === 0} />
                        {c.name === 'Cost Breakdown' ? (
                          <span
                            style={{
                              position: 'absolute',
                              top: -10,
                              right: 14,
                              fontFamily: INTER,
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                              color: '#fbbf24',
                              background: 'rgba(251,191,36,0.12)',
                              border: '1px solid rgba(251,191,36,0.45)',
                              borderRadius: 999,
                              padding: '3px 10px',
                              opacity: popIn(f, fps, B.filesIn + i * 10 + 12),
                            }}
                          >
                            Not for customer
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </AppFrame>
        </div>
      </div>

      {/* PLAN SCAN — center stage, above app (opaque fast so layers never double-expose) */}
      {planP > 0.01 ? (
        <div
          style={{
            position: 'absolute',
            left: 560,
            top: 200 + (1 - planP) * 46,
            opacity: Math.min(1, planP * 3),
            transform: `scale(${0.94 + 0.06 * planP})`,
          }}
        >
          <div style={{ position: 'relative' }}>
            <PlanSheet width={900} rowHi={rowHi} dim={0.12} />
            <ScanBeam p={scanP} width={900} height={900 * 0.72} />
            {/* extraction chips arcing toward the rail */}
            {[
              { label: '27 windows', at: B.scanStart + 34, x: -180, y: 120 },
              { label: '240.0 LF', at: B.scanStart + 56, x: -210, y: 250 },
              { label: '1 sliding door · 3 panels', at: B.scanStart + 78, x: -240, y: 380 },
              { label: 'Viwinco', at: B.scanStart + 96, x: -170, y: 500 },
              { label: '3 FL approvals', at: B.scanStart + 112, x: -205, y: 610 },
            ].map((c) => (
              <ExtractChip key={c.label} label={c.label} p={popIn(f, fps, c.at)} style={{ left: c.x - easeOutWin(f, c.at + 10, c.at + 40) * 120, top: c.y }} />
            ))}
          </div>
        </div>
      ) : null}

      {/* UPLOAD MODAL */}
      {modalP > 0.01 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', zIndex: 30 }}>
          <AbsoluteFill style={{ background: 'rgba(2,6,23,0.6)', opacity: modalP }} />
          <div style={{ transform: `scaleY(${Math.max(0.02, modalP)})`, opacity: Math.min(1, modalP * 1.4) }}>
            <Card radius={24} style={{ width: 660, padding: '30px 34px', boxShadow: T.menuShadow }}>
              <div style={{ fontFamily: INTER, fontSize: 23, fontWeight: 800, color: T.text1, letterSpacing: '-0.02em' }}>
                Upload Window Schedule
              </div>
              <div style={{ fontFamily: INTER, fontSize: 14.5, color: T.text4, marginTop: 8, lineHeight: 1.5 }}>
                AI reads it and fills the window count, LF, manufacturer, and buck cut list
              </div>
              <div style={{ marginTop: 20, background: T.goldSoft, border: '1px solid rgba(181,143,74,0.3)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontFamily: INTER, fontSize: 16.5, fontWeight: 800, color: T.text1 }}>
                  ⚡ Upload your plan — we read it for you
                </div>
                <div style={{ fontFamily: INTER, fontSize: 13.5, color: T.text4, marginTop: 8, lineHeight: 1.55 }}>
                  PDF, PNG, or JPEG of the window schedule. One upload fills the window count, total LF, and
                  manufacturer — and builds your buck cut list — automatically.
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                  <GoldButton pressed={f >= B.choosePress && f < B.choosePress + 8}>Choose plan file</GoldButton>
                </div>
              </div>
              <div style={{ marginTop: 16, fontFamily: INTER, fontSize: 13, fontWeight: 600, color: T.goldHi, textAlign: 'center', ...TNUM }}>
                ✨ 7 of 100 AI plan reads left this month
              </div>
            </Card>
          </div>
          {/* mini plan sheet flying to the dropzone */}
          {f >= B.sheetIn && f < B.modalOut ? (
            <div
              style={{
                position: 'absolute',
                left: interpolate(sheetFly, [0, 1], [1700, 1150]),
                top: interpolate(sheetFly, [0, 1], [1000, 640]),
                transform: `rotate(${(1 - sheetFly) * 14 - 3}deg) scale(${0.32})`,
                transformOrigin: 'top left',
                opacity: Math.min(1, sheetFly * 2),
              }}
            >
              <PlanSheet width={760} />
            </div>
          ) : null}
        </AbsoluteFill>
      ) : null}

      {/* PDF — the finished customer quote */}
      {pdfP > 0.01 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', zIndex: 26 }}>
          <AbsoluteFill style={{ background: 'rgba(2,6,23,0.72)', opacity: pdfP }} />
          <div
            style={{
              transform: `translateY(${(1 - springIn(f, fps, B.pdfIn, 26)) * 420}px) rotate(${(1 - springIn(f, fps, B.pdfIn, 26)) * 2}deg)`,
              position: 'relative',
            }}
          >
            <div
              style={{
                clipPath: `inset(0 0 ${(1 - win(f, B.pdfIn + 14, B.pdfBuilt - 24)) * 62}% 0)`,
              }}
            >
              <QuotePdfPage
                width={690}
                price={f >= B.pdfBuilt - 40 ? '$' + Math.round(countUp(f, 0, SELL_2, B.pdfBuilt - 40, B.pdfBuilt - 6)).toLocaleString('en-US') : '$0'}
                preparedFor="Smith Residence"
                scope={[
                  ['Manufacturer', 'Viwinco'],
                  ['Application', 'Nail-fin'],
                  ['House Type', 'Block'],
                  ['Construction', 'New'],
                  ['Glass Type', 'Impact'],
                  ['Stories', '2'],
                  ['Linear Footage', '240 ft'],
                  ['Window Count', '27 windows'],
                  ['Sliding Glass Doors', '1 door · 3 panels'],
                  ['Permit', 'Included'],
                ]}
              />
            </div>
            {/* signature draw + approved badge */}
            <svg width="200" height="58" viewBox="0 0 240 70" style={{ position: 'absolute', left: 56, bottom: 66 }}>
              <path
                d="M10 48 C 30 14 44 60 62 40 C 76 24 82 52 100 40 C 118 28 122 50 142 36 C 158 25 170 46 194 30 C 206 22 218 34 230 26"
                fill="none"
                stroke="#1f2937"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeDasharray={420}
                strokeDashoffset={420 * (1 - easeOutWin(f, B.signDraw, B.signDraw + 22))}
                opacity={f >= B.signDraw ? 1 : 0}
              />
            </svg>
            {f >= B.approved ? (
              <div
                style={{
                  position: 'absolute',
                  right: -348,
                  top: 470,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(16,185,129,0.45)',
                  borderRadius: 16,
                  padding: '16px 22px',
                  boxShadow: '0 24px 48px -12px rgba(0,0,0,0.7)',
                  transform: `scale(${popIn(f, fps, B.approved)})`,
                }}
              >
                <CheckDot size={44} pop={1} />
                <div>
                  <div style={{ fontFamily: INTER, fontSize: 26, fontWeight: 800, color: T.emerald }}>Quote approved</div>
                  <div style={{ fontFamily: INTER, fontSize: 16, fontWeight: 600, color: T.text4, marginTop: 4, opacity: win(f, B.approved + 8, B.approved + 20) }}>
                    E-sign by link — no app, no login.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* TOASTS */}
      {f >= B.status1 + 12 && f < B.status1 + 68 ? (
        <div style={{ position: 'absolute', bottom: 34, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 45, opacity: Math.min(win(f, B.status1 + 12, B.status1 + 20), 1 - win(f, B.status1 + 58, B.status1 + 68)) }}>
          <Toast scale={1.15}>Reading your plan with AI — up to a minute…</Toast>
        </div>
      ) : null}
      {f >= B.toastIn && f < B.toastIn + 82 ? (
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 45,
            transform: `translateY(${(1 - springIn(f, fps, B.toastIn, 16)) * 40}px)`,
            opacity: Math.min(springIn(f, fps, B.toastIn, 16), 1 - win(f, B.toastIn + 72, B.toastIn + 82)),
          }}
        >
          <Toast scale={1.5}>
            <b>Applied:</b>&nbsp;27 windows · 240.0 LF · 1 sliding glass door (3 panels) · cut list (48 boards) ·
            Viwinco · 3 FL approvals
          </Toast>
        </div>
      ) : null}
      {f >= B.usedToast && f < B.usedToast + 46 ? (
        <div style={{ position: 'absolute', bottom: 34, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 45, opacity: Math.min(win(f, B.usedToast, B.usedToast + 8), 1 - win(f, B.usedToast + 38, B.usedToast + 46)) }}>
          <Toast scale={1.15}>1 AI read used — 99 left this month</Toast>
        </div>
      ) : null}
      {f >= B.savedToast && f < B.savedToast + 44 ? (
        <div style={{ position: 'absolute', bottom: 34, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 45, opacity: Math.min(win(f, B.savedToast, B.savedToast + 8), 1 - win(f, B.savedToast + 36, B.savedToast + 44)) }}>
          <Toast scale={1.3}>Job saved</Toast>
        </div>
      ) : null}

      {/* honesty popover */}
      {f >= B.popover && f < B.popover + 52 ? (
        <div
          style={{
            position: 'absolute',
            left: 448,
            top: 640,
            zIndex: 44,
            maxWidth: 380,
            background: 'rgba(15,23,42,0.97)',
            border: '1px solid rgba(181,143,74,0.5)',
            borderRadius: 12,
            padding: '13px 16px',
            fontFamily: INTER,
            fontSize: 14.5,
            lineHeight: 1.5,
            color: T.text2,
            boxShadow: T.menuShadow,
            opacity: Math.min(popIn(f, fps, B.popover), 1 - win(f, B.popover + 44, B.popover + 52)),
            transform: `translateY(${(1 - popIn(f, fps, B.popover)) * 14}px)`,
          }}
        >
          ✨ <b style={{ color: T.goldHi }}>Auto-filled by AI</b> — We read this from your plan. Double-check it
          before you bid.
        </div>
      ) : null}

      {/* Anton copy overlays */}
      {/* Copy overlays — all share one left margin (x=500) and two consistent
          bands: lower-third (y≈806) over live UI, upper (y≈108) when the stage
          is dimmed for the AI beats. Scrim on every one for phone legibility. */}
      <AntonOverlay frame={f} fps={fps} lines={['NO SPREADSHEETS.', 'JUST TAPS.']} from={70} to={B.tapStories + 20} x={500} y={796} size={62} scrim />
      <AntonOverlay frame={f} fps={fps} lines={['TYPE THE FOOTAGE.']} from={B.lfFocus - 4} to={B.key3 + 34} x={500} y={806} size={62} scrim />
      <AntonOverlay frame={f} fps={fps} lines={['WATCH IT PRICE ITSELF.']} from={B.bdRows + 30} to={B.bdTotal + 28} x={500} y={806} size={60} sub="Real materials. Real crew-hours. To the foot." scrim />
      <AntonOverlay frame={f} fps={fps} lines={['OR DON’T TYPE AT ALL.']} from={B.aiDim + 4} to={B.modalIn + 30} x={500} y={108} size={74} scrim />
      <AntonOverlay frame={f} fps={fps} lines={['AI READS THE PLAN.']} from={B.toastIn + 26} to={B.priceBridge + 56} x={500} y={108} size={70} sub="Every opening. Counts, sizes, types — in seconds." scrim />
      <AntonOverlay frame={f} fps={fps} lines={['ENTER IT ONCE.', 'GET EVERY DOCUMENT.']} from={B.filesIn + 12} to={B.viewClick - 6} x={500} y={796} size={62} scrim />

      {/* hit flash */}
      {hitFlash > 0 ? <AbsoluteFill style={{ background: '#fdf2d0', opacity: hitFlash * 0.85, zIndex: 55 }} /> : null}

      {/* cursor */}
      {f > 24 && f < B.pdfIn ? <Cursor x={cur.x} y={cur.y} click={click} /> : null}
    </AbsoluteFill>
  );
};
