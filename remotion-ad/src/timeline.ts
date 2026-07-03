/**
 * Master timeline — absolute frame markers. 2200 frames @ 30fps = 73.3s.
 * Beat grid: 22 frames (~82 BPM).
 */
export const DURATION = 2200;

export const SC = {
  painA: { from: 0, to: 120 },
  painB: { from: 120, to: 230 },
  pivot: { from: 230, to: 360 },
  journey: { from: 360, to: 1640 }, // persistent app world: setup → math → AI → docs
  sync: { from: 1640, to: 1790 },
  payoff: { from: 1790, to: 1900 },
  plans: { from: 1900, to: 2020 },
  end: { from: 2020, to: 2200 },
} as const;

/** The honest stopwatch: runs 1:1 with the film. */
export const TIMER_START = 400; // job-name focus — first input
export const TIMER_STOP = 1612; // "Quote approved" — the job story ends here
export const timerSeconds = (frame: number) =>
  Math.max(0, (Math.min(frame, TIMER_STOP) - TIMER_START) / 30);
export const timerLabel = (frame: number) => {
  const s = timerSeconds(frame);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
};
/** Final frozen readout, e.g. "0:39.3" */
export const TIMER_FINAL = timerLabel(TIMER_STOP);
