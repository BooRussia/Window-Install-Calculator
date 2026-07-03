/**
 * Master timeline — absolute frame markers. 2040 frames @ 30fps = 68s.
 * Beat grid: 22 frames (~82 BPM).
 */
export const SC = {
  open: { from: 0, to: 200 }, // clean brand open
  journey: { from: 200, to: 1480 }, // app world: setup → math → AI → docs
  sync: { from: 1480, to: 1630 },
  payoff: { from: 1630, to: 1740 },
  plans: { from: 1740, to: 1860 },
  end: { from: 1860, to: 2040 },
} as const;

export const DURATION = SC.end.to;

/** The honest stopwatch: runs 1:1 with the film. */
export const TIMER_START = SC.journey.from + 40; // job-name focus — first input
export const TIMER_STOP = SC.journey.from + 1252; // "Quote approved" — job story ends
export const timerSeconds = (frame: number) =>
  Math.max(0, (Math.min(frame, TIMER_STOP) - TIMER_START) / 30);
export const timerLabel = (frame: number) => {
  const s = timerSeconds(frame);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
};
/** Final frozen readout, e.g. "0:40.4" */
export const TIMER_FINAL = timerLabel(TIMER_STOP);
