/**
 * Loop timeline — the seamless 54s demo that embeds on the landing page.
 * 1620 frames @ 30fps = 54.0s. Same honest-stopwatch delta as the ad (0:40.4).
 *
 *   intro  0–70    LIVE DEMO title
 *   journey 70–1350  the unmodified QuoteJourney (1280f)
 *   outro  1350–1620  frozen timer + SUBSCRIBE CTA, then fade back to the
 *                     exact navy+ambient state the intro opens on (seam).
 */
export const LSC = {
  intro: { from: 0, to: 70 },
  journey: { from: 70, to: 1350 },
  outro: { from: 1350, to: 1620 },
} as const;

export const LOOP_DURATION = 1620;

/** The honest stopwatch inside the loop — same 1212-frame (0:40.4) delta. */
export const LOOP_TIMER_START = LSC.journey.from + 40; // 110
export const LOOP_TIMER_STOP = LSC.journey.from + 1252; // 1322
