# Anchor UX Audit — Executive Summary (July 11, 2026)

Full plan: [`CONVERSION-SETTINGS-UI-PLAN.md`](./CONVERSION-SETTINGS-UI-PLAN.md)

## Bottom line

The calculator and sample-chip path are strong. Conversion and daily feel break at **seams**: post-signup landing on the dashboard instead of a priced job, trial terms missing from signup, brand nudge hidden until rates change, Settings deep-links incomplete for doors/labor, and an upsell modal that can sit **behind** the dashboard.

## Top 10 changes to consider

1. **Land new users in the calculator with a sample job applied** (skip empty dashboard as the first screen).
2. **State trial terms on signup** (14 days · 8 quotes · no card).
3. **Single banner: brand setup before sample-rates** (fix inverted nudge logic).
4. **Show Log In on mobile landing** (returning users currently only see signup).
5. **Fix pricing CTAs for logged-in users** (they only close landing).
6. **Raise upsell modal z-index** above the dashboard (or close dashboard first).
7. **Fix sliding/bifold Settings pencils** and always activate the correct Rates leaf on jumps.
8. **Resume plan checkout after auth** once Stripe Phase 3 is live.
9. **Unify mobile nav labels** (New quote / Account) and complete modal Escape/focus stack.
10. **Ops blockers:** Stripe wiring, legal finalize, verify rates in `DATA-TO-VERIFY.md`.

## Already fixed since July 2 (don’t re-litigate)

Demo-rate PDF guard · onboarding skip · “Welcome to Anchor” · first-run checklist · auth legal line · password hint · demo banner → Rates · ratesCustomized signature check · compare UI restored.

## Proposed phases

| Phase | Focus |
|-------|--------|
| **A** | Dead-end / messaging quick wins |
| **B** | Time-to-first-price activation |
| **C** | Settings correctness |
| **D** | UI cohesion & a11y |
| **E** | Stripe / legal / rate verification (ops) |

Reply with the decision checklist in the full plan when you want implementation to start.
