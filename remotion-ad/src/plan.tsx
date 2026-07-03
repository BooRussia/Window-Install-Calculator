import React from 'react';
import { T, TNUM } from './theme';
import { INTER } from './fonts';

/* ---------------------------------------------------------------------------
 * A stylized architect's "WINDOW SCHEDULE" sheet + AI scan overlay.
 * ------------------------------------------------------------------------- */

export type ScheduleRow = { mark: string; qty: string; w: string; h: string; type: string; note: string };

export const SCHEDULE_ROWS: ScheduleRow[] = [
  { mark: 'W-1', qty: '6', w: '37"', h: '63"', type: 'SINGLE HUNG', note: 'R.O.' },
  { mark: 'W-2', qty: '8', w: '53"', h: '63"', type: 'HORIZ ROLLER', note: 'R.O.' },
  { mark: 'W-3', qty: '4', w: '37"', h: '50"', type: 'SINGLE HUNG', note: 'R.O.' },
  { mark: 'W-4', qty: '5', w: '24"', h: '38"', type: 'CASEMENT', note: 'M.O.' },
  { mark: 'W-5', qty: '4', w: '72"', h: '63"', type: 'PICTURE', note: 'R.O.' },
  { mark: 'D-1', qty: '2', w: '108"', h: '96"', type: 'SGD · XOX', note: 'R.O.' },
];

/** Blueprint-style plan sheet. `inkP` 0→1 draws content in; rowHi = index-progress of highlighted rows. */
export const PlanSheet: React.FC<{
  width?: number;
  rowHi?: number; // rows highlighted so far (fractional)
  dim?: number; // 0 = normal paper, 1 = dimmed (under scan)
}> = ({ width = 760, rowHi = -1, dim = 0 }) => {
  const H = width * 0.72;
  const pad = width * 0.045;
  const cols = '0.8fr 0.6fr 0.8fr 0.8fr 1.7fr 0.7fr';
  return (
    <div
      style={{
        width,
        height: H,
        background: `linear-gradient(180deg, rgba(${226 - dim * 60},${232 - dim * 60},${240 - dim * 55},1), rgba(${203 - dim * 55},${213 - dim * 58},${225 - dim * 60},1))`,
        borderRadius: 8,
        boxShadow: '0 34px 80px -26px rgba(0,0,0,0.8)',
        padding: pad,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: INTER,
        color: '#1e293b',
      }}
    >
      {/* title block */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: width * 0.026, fontWeight: 800, letterSpacing: '0.16em' }}>WINDOW SCHEDULE</div>
        <div style={{ fontSize: width * 0.015, fontWeight: 600, color: '#64748b', letterSpacing: '0.1em', ...TNUM }}>
          SHEET A-601 · SMITH RESIDENCE
        </div>
      </div>
      <div style={{ height: 2, background: '#334155', margin: `${width * 0.018}px 0` }} />
      {/* header row */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, padding: `0 ${width * 0.012}px ${width * 0.008}px` }}>
        {['MARK', 'QTY', 'WIDTH', 'HEIGHT', 'TYPE', 'DIM'].map((h) => (
          <div key={h} style={{ fontSize: width * 0.0155, fontWeight: 800, letterSpacing: '0.12em', color: '#475569' }}>
            {h}
          </div>
        ))}
      </div>
      {SCHEDULE_ROWS.map((r, i) => {
        const hi = Math.min(1, Math.max(0, (rowHi ?? -1) - i));
        return (
          <div
            key={r.mark}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              padding: `${width * 0.0128}px ${width * 0.012}px`,
              borderTop: '1px solid rgba(51,65,85,0.25)',
              background: hi > 0 ? `rgba(181,143,74,${0.26 * hi})` : undefined,
              boxShadow: hi > 0 ? `inset 0 0 0 ${1.5 * hi}px rgba(181,143,74,${0.85 * hi})` : undefined,
              borderRadius: 4,
              position: 'relative',
            }}
          >
            {[r.mark, r.qty, r.w, r.h, r.type, r.note].map((v, j) => (
              <div
                key={j}
                style={{
                  fontSize: width * 0.0175,
                  fontWeight: j === 0 ? 800 : 600,
                  color: j === 4 ? '#334155' : '#1e293b',
                  letterSpacing: j === 4 ? '0.04em' : undefined,
                  ...TNUM,
                }}
              >
                {v}
              </div>
            ))}
            {hi > 0.55 ? (
              <div
                style={{
                  position: 'absolute',
                  right: width * 0.025,
                  top: '50%',
                  transform: `translate(0, -50%) scale(${hi})`,
                  background: 'linear-gradient(180deg,#d8b765,#b58f4a)',
                  color: '#1a1206',
                  fontSize: width * 0.0138,
                  fontWeight: 900,
                  borderRadius: 999,
                  padding: `${width * 0.004}px ${width * 0.012}px`,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 6px 18px -6px rgba(181,143,74,0.7)',
                  ...TNUM,
                }}
              >
                ✓ {r.qty} × {r.type.split(' ')[0]}
              </div>
            ) : null}
          </div>
        );
      })}
      {/* corner marks */}
      <div style={{ position: 'absolute', bottom: pad * 0.6, right: pad, fontSize: width * 0.014, color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', ...TNUM }}>
        FL# 17894.3 · NOA 20-0406.09
      </div>
    </div>
  );
};

/** Gold scan beam sweeping vertically across a region. `p` 0→1. */
export const ScanBeam: React.FC<{ p: number; width: number; height: number }> = ({ p, width, height }) => {
  if (p <= 0 || p >= 1) return null;
  const y = p * height;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none', overflow: 'hidden', borderRadius: 8 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: y - 90,
          width,
          height: 90,
          background: 'linear-gradient(180deg, transparent, rgba(201,165,88,0.16))',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: y,
          width,
          height: 3,
          background: 'linear-gradient(90deg, transparent, #dfc07a 18%, #dfc07a 82%, transparent)',
          boxShadow: '0 0 14px 2px rgba(216,185,106,0.85), 0 0 40px 8px rgba(181,143,74,0.45)',
        }}
      />
    </div>
  );
};

/** Floating extraction chip (e.g. "27 windows"). */
export const ExtractChip: React.FC<{ label: string; p: number; style?: React.CSSProperties }> = ({ label, p, style }) => (
  <div
    style={{
      position: 'absolute',
      background: 'rgba(15,23,42,0.95)',
      border: '1px solid rgba(181,143,74,0.55)',
      borderRadius: 999,
      padding: '9px 18px',
      fontFamily: INTER,
      fontSize: 16,
      fontWeight: 800,
      color: '#fdf6e3',
      boxShadow: '0 14px 34px -12px rgba(0,0,0,0.8), 0 0 22px -4px rgba(181,143,74,0.4)',
      opacity: Math.min(1, p),
      transform: `translateY(${(1 - Math.min(1, p)) * 22}px) scale(${0.85 + 0.15 * Math.min(1, p)})`,
      whiteSpace: 'nowrap',
      ...TNUM,
      ...style,
    }}
  >
    {label}
  </div>
);
