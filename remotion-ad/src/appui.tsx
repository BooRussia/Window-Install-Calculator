import React from 'react';
import { T, TNUM, money, money0 } from './theme';
import { INTER } from './fonts';
import { AiBadge, AppHeader, Card, Control, Seg } from './ui';

/* ---------------------------------------------------------------------------
 * Cloned application UI — faithful to index.html (labels, colors, structure).
 * All components are pure functions of props; scenes drive them from frames.
 * ------------------------------------------------------------------------- */

const microLabel: React.CSSProperties = {
  fontFamily: INTER,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: T.text5,
};

/** Impact pill (High/Medium impact ⓘ) */
const ImpactPill: React.FC<{ level: string }> = ({ level }) => (
  <span
    style={{
      fontFamily: INTER,
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: '#94a3b8',
      border: '1px solid rgba(148,163,184,0.3)',
      borderRadius: 999,
      padding: '2px 8px',
    }}
  >
    {level}
  </span>
);

/** One labeled segmented row in the rail. */
export const SegRow: React.FC<{
  label: string;
  impact?: string;
  helper?: string;
  options: string[];
  active: number;
  ai?: boolean;
  glow?: number;
}> = ({ label, impact, helper, options, active, ai = false, glow = 0 }) => (
  <div
    style={{
      padding: '13px 2px',
      borderRadius: 12,
      background: glow > 0 ? `rgba(181,143,74,${0.1 * glow})` : undefined,
      boxShadow: glow > 0 ? `0 0 0 1px rgba(181,143,74,${0.35 * glow})` : undefined,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: helper ? 4 : 9 }}>
      <span style={microLabel}>{label}</span>
      {impact ? <ImpactPill level={impact} /> : null}
      {ai ? <AiBadge /> : null}
    </div>
    {helper ? (
      <div style={{ fontFamily: INTER, fontSize: 12, color: T.text5, marginBottom: 9, lineHeight: 1.4 }}>
        {helper}
      </div>
    ) : null}
    <Seg options={options} active={active} />
  </div>
);

/** The gold-outline AI upload button; morphs into spinner + status text. */
export const AiUploadButton: React.FC<{
  status?: string | null;
  spinnerAngle?: number;
  pressed?: boolean;
}> = ({ status, spinnerAngle = 0, pressed }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      border: `1px solid ${status ? 'rgba(181,143,74,0.7)' : 'rgba(181,143,74,0.45)'}`,
      background: status ? 'rgba(181,143,74,0.08)' : 'transparent',
      color: T.goldHi,
      borderRadius: 999,
      padding: '12px 18px',
      fontFamily: INTER,
      fontWeight: 700,
      fontSize: 13.5,
      transform: pressed ? 'scale(0.97)' : undefined,
      whiteSpace: 'nowrap',
    }}
  >
    {status ? (
      <>
        <svg width="15" height="15" viewBox="0 0 20 20" style={{ transform: `rotate(${spinnerAngle}deg)` }}>
          <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(201,165,88,0.25)" strokeWidth="3" />
          <path d="M10 2 A8 8 0 0 1 18 10" fill="none" stroke={T.goldHi} strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span>{status}</span>
      </>
    ) : (
      <>
        <span style={{ fontSize: 15 }}>⬆</span>
        <span>Upload Window Schedule</span>
      </>
    )}
  </div>
);

export type RailState = {
  jobName?: string;
  jobNameCaret?: boolean;
  uploadStatus?: string | null;
  spinnerAngle?: number;
  uploadPressed?: boolean;
  construction: number; // 0 New Construction, 1 Remodel
  house: number; // 0 Block Framed, 1 Stick Framed
  stories: number; // 0,1,2
  manufacturer?: string;
  lf?: string;
  lfCaret?: boolean;
  lfHint?: string;
  glass: number; // 0 Impact, 1 Non-Impact
  windows?: string;
  doorsSummary?: string;
  aiGlow?: number; // 0→1 gold sweep on AI-filled fields
  scrollY?: number;
};

/** The Job rail — cloned left edge rail. Fixed 420px wide. */
export const JobRail: React.FC<{ s: RailState; height?: number }> = ({ s, height = 1024 }) => {
  const glow = s.aiGlow ?? 0;
  return (
    <div
      style={{
        width: 420,
        height,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #0d1426 0%, #060a16 100%)',
        borderRight: '1px solid rgba(30,41,59,0.95)',
        boxShadow: '22px 0 46px -26px rgba(0,0,0,0.75)',
        padding: '20px 22px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{ transform: `translateY(${-(s.scrollY ?? 0)}px)` }}>
        <div style={{ ...microLabel, fontSize: 12, letterSpacing: '0.2em', color: T.text4, marginBottom: 16 }}>
          The Job
        </div>

        {/* Job name */}
        <Control
          label="Job name"
          value={s.jobName}
          placeholder="Smith residence"
          focused={Boolean(s.jobNameCaret)}
          caret={s.jobNameCaret}
        />

        {/* AI tools */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <span style={microLabel}>AI tools</span>
            <ImpactPill level="Low impact" />
          </div>
          <AiUploadButton status={s.uploadStatus} spinnerAngle={s.spinnerAngle} pressed={s.uploadPressed} />
        </div>

        {/* Gold callout */}
        <div
          style={{
            marginTop: 16,
            background: T.goldSoft,
            border: '1px solid rgba(181,143,74,0.3)',
            borderRadius: 12,
            padding: '11px 13px',
            fontFamily: INTER,
            fontSize: 12,
            lineHeight: 1.45,
            color: T.text3,
          }}
        >
          Everything's pre-set for a typical Florida job — change only what's different.
        </div>

        {/* Site & build */}
        <div style={{ ...microLabel, color: T.text4, marginTop: 20, marginBottom: 2 }}>Site &amp; build</div>
        <SegRow label="Construction" impact="High impact" options={['New Construction', 'Remodel']} active={s.construction} />
        <SegRow label="House" impact="High impact" options={['Block Framed', 'Stick Framed']} active={s.house} ai={glow > 0.35} glow={glow} />
        <SegRow label="Stories" impact="High impact" options={['1 Story', '2 Story', '3 Story']} active={s.stories} />

        <div style={{ padding: '13px 2px' }}>
          <div style={{ ...microLabel, marginBottom: 9 }}>
            Manufacturer <span style={{ marginLeft: 6 }}>{glow > 0.5 ? <AiBadge /> : null}</span>
          </div>
          <Control value={s.manufacturer} placeholder="Select manufacturer" chevron focused={false} />
        </div>

        {/* Openings */}
        <div style={{ ...microLabel, color: T.text4, marginTop: 14, marginBottom: 10 }}>Openings</div>
        <div
          style={{
            borderRadius: 12,
            padding: 2,
            background: glow > 0 ? `rgba(181,143,74,${0.1 * glow})` : undefined,
            boxShadow: glow > 0 ? `0 0 0 1px rgba(181,143,74,${0.35 * glow})` : undefined,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={microLabel}>Total window width (linear feet)</span>
            {glow > 0.2 ? <AiBadge /> : null}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 12, color: T.text5, marginBottom: 9, lineHeight: 1.4 }}>
            Add up the width of every window opening, in feet.
          </div>
          <div
            style={{
              background: T.controlBg,
              border: `1px solid ${s.lfCaret ? 'rgba(181,143,74,0.7)' : 'rgba(71,85,105,0.55)'}`,
              boxShadow: s.lfCaret ? '0 0 0 3px rgba(181,143,74,0.18)' : undefined,
              borderRadius: 10,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontFamily: INTER, fontWeight: 800, fontSize: 24, color: T.text0, ...TNUM }}>
              {s.lf || <span style={{ color: 'rgba(148,163,184,0.35)' }}>0</span>}
              {s.lfCaret ? (
                <span style={{ display: 'inline-block', width: 2.5, height: 20, background: T.goldHi, marginLeft: 2 }} />
              ) : null}
            </span>
            <span style={{ ...microLabel, fontSize: 11 }}>ft</span>
          </div>
          {s.lfHint ? (
            <div style={{ fontFamily: INTER, fontSize: 11.5, color: T.text5, marginTop: 6, ...TNUM }}>{s.lfHint}</div>
          ) : null}
        </div>

        <SegRow label="Glass" impact="High impact" helper="Hurricane-rated (impact) glass costs more than standard glass." options={['Impact', 'Non-Impact']} active={s.glass} ai={glow > 0.4} glow={glow} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 2px 14px' }}>
          <span style={microLabel}>Windows</span>
          <div
            style={{
              background: T.controlBg,
              border: `1px solid ${T.controlBorder}`,
              borderRadius: 10,
              padding: '7px 14px',
              fontFamily: INTER,
              fontWeight: 800,
              fontSize: 16,
              color: T.text0,
              ...TNUM,
            }}
          >
            {s.windows ?? '0'}
          </div>
          {glow > 0.3 ? <AiBadge /> : null}
        </div>

        {s.doorsSummary ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 2px 12px' }}>
            <span style={microLabel}>Sliding glass doors</span>
            <span style={{ fontFamily: INTER, fontSize: 12.5, fontWeight: 600, color: T.text3, ...TNUM }}>
              {s.doorsSummary}
            </span>
            {glow > 0.45 ? <AiBadge /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
 * Main stage pieces
 * ------------------------------------------------------------------------- */

/** Live recap band: SIZE line over SPEC line. */
export const RecapBand: React.FC<{ size: string; spec: string; opacity?: number }> = ({ size, spec, opacity = 1 }) => (
  <div style={{ textAlign: 'center', opacity }}>
    <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 700, color: T.text2, letterSpacing: '0.01em', ...TNUM }}>
      {size}
    </div>
    <div style={{ fontFamily: INTER, fontSize: 12.5, fontWeight: 600, color: T.text5, marginTop: 4, letterSpacing: '0.04em' }}>
      {spec}
    </div>
  </div>
);

/** Giant selling price + markup label + cost/profit cards. */
export const PriceHero: React.FC<{
  price: number;
  markup?: number;
  cost: number;
  profit: number;
  pulse?: number; // 0→1→0 recalc pulse
  size?: number;
  showCents?: boolean;
}> = ({ price, markup = 35, cost, profit, pulse = 0, size = 118, showCents = true }) => {
  const scale = 1 + 0.035 * Math.sin(Math.min(1, Math.max(0, pulse)) * Math.PI);
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontFamily: INTER,
          fontWeight: 900,
          letterSpacing: '-0.04em',
          fontSize: size,
          lineHeight: 1.05,
          color: '#f8fafc',
          textShadow: `0 0 30px rgba(248,250,252,0.25), 0 0 ${60 + pulse * 40}px rgba(201,165,88,${0.18 + pulse * 0.25})`,
          transform: `scale(${scale})`,
          ...TNUM,
        }}
      >
        {showCents ? money(price) : money0(price)}
      </div>
      <div style={{ ...microLabel, fontSize: 12.5, letterSpacing: '0.2em', marginTop: 12, color: T.text4 }}>
        Selling price · @ {markup}% markup
      </div>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 26 }}>
        {[
          { label: 'Total job cost', value: money(cost), gold: false },
          { label: 'Projected profit', value: money(profit), gold: true },
        ].map((c) => (
          <Card key={c.label} style={{ padding: '16px 30px', minWidth: 250 }}>
            <div style={{ ...microLabel, fontSize: 10.5, marginBottom: 7 }}>{c.label}</div>
            <div
              style={{
                fontFamily: INTER,
                fontWeight: 900,
                fontSize: 30,
                letterSpacing: '-0.03em',
                color: c.gold ? T.goldHi : T.text0,
                textShadow: c.gold ? '0 0 18px rgba(201,165,88,0.35)' : undefined,
                ...TNUM,
              }}
            >
              {c.value}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export type BreakdownRow = {
  item: string;
  rate: string;
  qty: string;
  cases: string;
  total: string;
};

/**
 * Internal cost sheet for the demo job — 240 LF, Block/Impact/2-story.
 * Every row = rate × 240 LF exactly; materials sum $6,144.00, labor $7,500.00,
 * grand total $13,644.00 ($56.85/LF) → ×1.35 markup = $18,419.40 selling.
 */
export const BREAKDOWN_ROWS: BreakdownRow[] = [
  { item: 'Caulking', rate: '$2.25', qty: '104 oz', cases: '4 cases', total: '$540.00' },
  { item: 'Shims', rate: '$0.36', qty: 'as needed', cases: '1 case', total: '$86.40' },
  { item: 'Backer Rod', rate: '$0.42', qty: 'as needed', cases: '1 roll', total: '$100.80' },
  { item: 'Flashing Tape', rate: '$1.18', qty: '9 rolls', cases: '2 cases', total: '$283.20' },
  { item: 'Wood Bucking', rate: '$12.35', qty: '96 boards', cases: '—', total: '$2,964.00' },
  { item: 'Block Sealer', rate: '$1.24', qty: '3 pails', cases: '—', total: '$297.60' },
  { item: 'Nail-Fin Screws', rate: '$2.10', qty: '2,180 ct', cases: '3 cases', total: '$504.00' },
  { item: 'Concrete Anchors', rate: '$5.70', qty: '1,240 ct', cases: '3 cases', total: '$1,368.00' },
  { item: 'Labor (install + cleanup)', rate: '$31.25', qty: '89.3 hrs', cases: '—', total: '$7,500.00' },
];

/** Full Breakdown table card. `rowsVisible` 0..N staggers rows in; `totalP` reveals footer. */
export const BreakdownCard: React.FC<{
  rows?: BreakdownRow[];
  rowsVisible: number;
  perLf: string;
  perLfP?: number;
  grandTotal: string;
  totalP: number;
  width?: number;
}> = ({ rows = BREAKDOWN_ROWS, rowsVisible, perLf, perLfP = 1, grandTotal, totalP, width = 880 }) => {
  const cols = '2.1fr 1fr 1fr 1fr 1.1fr';
  return (
    <Card style={{ width, padding: '22px 28px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: INTER, fontSize: 19, fontWeight: 700, color: T.text1 }}>Full Breakdown</div>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 12.5,
            fontWeight: 800,
            color: T.goldHi,
            border: '1px solid rgba(181,143,74,0.45)',
            background: T.goldSoft,
            borderRadius: 999,
            padding: '5px 13px',
            opacity: perLfP,
            transform: `scale(${0.8 + 0.2 * perLfP})`,
            ...TNUM,
          }}
        >
          {perLf} / LF
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          padding: '0 10px 9px',
          borderBottom: '1px solid rgba(30,41,59,0.8)',
        }}
      >
        {['Item', 'Rate per LF', 'Quantity', 'Case Count', 'Total Cost'].map((h, i) => (
          <div key={h} style={{ ...microLabel, fontSize: 10, textAlign: i === 0 ? 'left' : 'right' }}>
            {h}
          </div>
        ))}
      </div>
      {rows.map((r, i) => {
        const p = Math.min(1, Math.max(0, rowsVisible - i));
        return (
          <div
            key={r.item}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              padding: '10.5px 10px',
              background: i % 2 === 1 ? 'rgba(15,23,42,0.35)' : 'transparent',
              borderRadius: 8,
              opacity: p,
              transform: `translateX(${(1 - p) * -14}px)`,
            }}
          >
            <div style={{ fontFamily: INTER, fontSize: 13.5, fontWeight: 600, color: T.text2 }}>{r.item}</div>
            {[r.rate, r.qty, r.cases, r.total].map((v, j) => (
              <div
                key={j}
                style={{
                  fontFamily: INTER,
                  fontSize: 13,
                  fontWeight: j === 3 ? 700 : 500,
                  color: v === 'as needed' || v === '—' || v === 'fixed job' ? T.text6 : j === 3 ? T.text1 : T.text4,
                  textAlign: 'right',
                  ...TNUM,
                }}
              >
                {v}
              </div>
            ))}
          </div>
        );
      })}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          padding: '13px 10px 6px',
          borderTop: '1px solid rgba(30,41,59,0.9)',
          opacity: totalP,
        }}
      >
        <div style={{ fontFamily: INTER, fontSize: 15, fontWeight: 800, color: T.text2 }}>Grand Total</div>
        <div
          style={{
            fontFamily: INTER,
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            background: T.goldTextGrad,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            ...TNUM,
          }}
        >
          {grandTotal}
        </div>
      </div>
    </Card>
  );
};

/* ---------------------------------------------------------------------------
 * Job Files — the four generated documents.
 * ------------------------------------------------------------------------- */
export const FILE_CARDS = [
  { group: 'For the Customer', name: 'Customer Quote', desc: 'Clean one-page price quote — safe to hand or email' },
  { group: 'For the Crew / Office', name: 'Cost Breakdown', desc: 'Full internal cost sheet — not for the customer' },
  { group: 'For the Crew / Office', name: 'Materials List', desc: 'Shopping list — packs to buy, check off at the supplier' },
  { group: 'For the Crew / Office', name: 'Buck Cut List', desc: 'Board-by-board cut sheet for the crew' },
];

export const FileCard: React.FC<{ name: string; desc: string; p: number; width?: number; highlight?: boolean }> = ({
  name,
  desc,
  p,
  width = 300,
  highlight = false,
}) => (
  <Card
    style={{
      width,
      padding: '18px 20px',
      opacity: p,
      transform: `translateY(${(1 - p) * 26}px) scale(${0.94 + 0.06 * p})`,
      borderColor: highlight ? 'rgba(181,143,74,0.5)' : undefined,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      {/* doc icon */}
      <svg width="20" height="24" viewBox="0 0 20 24">
        <path d="M2 2 h10 l6 6 v14 h-16 z" fill="rgba(201,165,88,0.12)" stroke={T.goldHi} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M12 2 v6 h6" fill="none" stroke={T.goldHi} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <div style={{ fontFamily: INTER, fontSize: 15.5, fontWeight: 700, color: T.text1 }}>{name}</div>
    </div>
    <div style={{ fontFamily: INTER, fontSize: 12, color: T.text5, lineHeight: 1.45, minHeight: 34 }}>{desc}</div>
    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
      {['Share', 'View', 'Download'].map((a) => (
        <span
          key={a}
          style={{
            fontFamily: INTER,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: a === 'Share' ? T.goldHi : T.text4,
            border: `1px solid ${a === 'Share' ? 'rgba(181,143,74,0.45)' : '#334155'}`,
            borderRadius: 999,
            padding: '4px 11px',
          }}
        >
          {a}
        </span>
      ))}
    </div>
  </Card>
);

/* ---------------------------------------------------------------------------
 * Customer Quote — the white letter page.
 * ------------------------------------------------------------------------- */
export const QuotePdfPage: React.FC<{
  width?: number;
  price: string;
  scope: [string, string][];
  preparedFor: string;
}> = ({ width = 620, price, scope, preparedFor }) => {
  const H = width * 1.16;
  return (
    <div
      style={{
        width,
        height: H,
        background: '#ffffff',
        borderRadius: 6,
        boxShadow: '0 40px 90px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
        padding: width * 0.075,
        fontFamily: INTER,
        color: '#111827',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg width={32} height={32} viewBox="0 0 100 100">
          <g fill="none" stroke="#b58f4a" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="50" cy="20" r="9" />
            <line x1="50" y1="29" x2="50" y2="82" />
            <line x1="33" y1="40" x2="67" y2="40" />
            <path d="M22 60 C 22 78 38 86 50 86 C 62 86 78 78 78 60" />
            <path d="M22 60 L 13 52" />
            <path d="M78 60 L 87 52" />
          </g>
        </svg>
        <div style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em' }}>Coastal Windows &amp; Door Co.</div>
      </div>
      <div style={{ height: 3, background: '#b58f4a', margin: '14px 0 22px', borderRadius: 2 }} />
      <div style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: '0.22em' }}>WINDOW INSTALLATION QUOTE</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12.5, color: '#6b7280', ...TNUM }}>
        <span>Date: July 3, 2026</span>
        <span>Quote No. 10274</span>
      </div>
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: '#9ca3af' }}>PREPARED FOR</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{preparedFor}</div>
        <div style={{ fontSize: 12.5, color: '#6b7280' }}>412 Palmetto Ln, Tampa, FL</div>
      </div>
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: '#9ca3af', marginBottom: 10 }}>
          SCOPE OF WORK
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 32, rowGap: 13 }}>
          {scope.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: 7 }}>
              <span style={{ fontSize: 13.5, color: '#6b7280' }}>{k}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, ...TNUM }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ textAlign: 'center', paddingBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.22em', color: '#9ca3af' }}>
          TOTAL INSTALLATION PRICE
        </div>
        <div style={{ fontSize: 58, fontWeight: 900, letterSpacing: '-0.03em', marginTop: 6, ...TNUM }}>{price}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Labor and materials included</div>
      </div>
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, fontSize: 10.5, color: '#9ca3af', lineHeight: 1.5 }}>
        This quote is valid for 30 days from the date above. Final pricing subject to change if scope changes upon
        inspection.
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------------------
 * The full app frame (header + rail + stage) — scenes place content in stage.
 * ------------------------------------------------------------------------- */
export const AppFrame: React.FC<{
  rail: RailState;
  children?: React.ReactNode;
  width?: number;
  height?: number;
}> = ({ rail, children, width = 1920, height = 1080 }) => (
  <div
    style={{
      width,
      height,
      background: T.navy,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}
  >
    <div style={{ position: 'absolute', inset: 0, background: T.bgAmbient, pointerEvents: 'none' }} />
    <AppHeader />
    <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
      <JobRail s={rail} height={height - 56} />
      <div style={{ flex: 1, position: 'relative' }}>{children}</div>
    </div>
  </div>
);
