import { interpolate, spring } from 'remotion';

export const FPS = 30;

/** Snappy UI spring — for panels, cards, chips entering. */
export const springIn = (frame: number, fps: number, delay = 0, durationInFrames = 24) =>
  spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames });

/** Bouncy spring — for badges, checkmarks, playful pops. */
export const popIn = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 170, mass: 0.6 } });

/** 0→1 linear window with clamped edges. */
export const win = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Ease-out cubic on a frame window. */
export const easeOutWin = (frame: number, from: number, to: number) => {
  const t = win(frame, from, to);
  return 1 - Math.pow(1 - t, 3);
};

/** Ease-in-out on a frame window. */
export const easeInOutWin = (frame: number, from: number, to: number) => {
  const t = win(frame, from, to);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Typewriter: how many chars of `s` are visible, starting at `delay`, at `cps` chars/frame. */
export const typed = (s: string, frame: number, delay: number, charsPerFrame = 0.9): string =>
  s.slice(0, Math.max(0, Math.floor((frame - delay) * charsPerFrame)));

/** Count-up with ease-out — returns the interpolated numeric value. */
export const countUp = (
  frame: number,
  from: number,
  to: number,
  startFrame: number,
  endFrame: number,
) => from + (to - from) * easeOutWin(frame, startFrame, endFrame);

/** Fade+rise entrance style. */
export const rise = (p: number, px = 24): React.CSSProperties => ({
  opacity: p,
  transform: `translateY(${(1 - p) * px}px)`,
});
