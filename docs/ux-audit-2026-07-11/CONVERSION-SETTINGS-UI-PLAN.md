# Anchor — Conversion, Settings & UI/UX Audit Plan

**Date:** July 11, 2026  
**Audited build:** `main` @ current HEAD (`2f2555d` lineage — includes ONBD example fills, first-run checklist, settings leaf nav, demo export guard, mobile tab bar)  
**Scope (requested):** Onboarding / signup conversion · Settings · Overall UI/UX feel  
**Companion:** Prior full audit (July 2) on `claude/ux-audit-master-plan` — 195 findings. This document re-audits **current main**, marks what shipped, and proposes a **decision-ready change plan** focused on activation and daily-use polish.

> Line numbers refer to `/workspace/index.html` on this branch’s base (`main`).

---

## 1. Verdict (read this first)

Anchor’s product core is strong: sample chips → priced job in one tap, honest pricing page, opt-in setup (no 14-field signup wall), and a real first-run checklist. **Conversion is not blocked by the calculator — it’s blocked by the seams between marketing promise and first value.**

| Area | Grade | One-line diagnosis |
|------|-------|--------------------|
| **Signup → first price** | B− | Low signup friction, but **dashboard detour + empty calculator** add 2–3 clicks vs “under a minute” copy |
| **Activation (first saved / sent quote)** | C+ | Demo rates + brand setup are easy to skip; export guard helps, but brand nudge is **hidden until rates are customized** |
| **Settings** | B | Search + leaf nav are solid; Rates is still the cognitive center of gravity; **sliding/bifold pencils broken** |
| **Overall feel** | B+ | Cohesive navy/gold identity; nav surface area and overlay stacking still create “app inside an app” moments |

**Do not rewrite the calculator.** Cash the existing differentiator: *first priced job in ~60 seconds* — then tighten trust (real rates/brand) and Settings deep-links.

---

## 2. What already shipped since the July 2 audit (do not re-fix)

These prior criticals / highs are **fixed or materially improved** on current `main`:

| Prior ID | Status | Evidence |
|----------|--------|----------|
| ONBD-1 (demo rates PDF with no warning) | **Fixed** | `demoExportBlocked()` checks brand **and** rates (18614–18627) |
| ONBD-6 (onboarding trap, no exit) | **Fixed** | `#obLater` — “Maybe later — take me to the calculator” (6587) |
| ONBD-8 (“Welcome back, Prime…”) | **Fixed** | Zero jobs → “Welcome to Anchor” (13476) |
| ONBD-9 (Cancel ships demo PDF) | **Fixed** | Branded `#demoGuardModal` with explicit Send / Setup |
| ONBD-12 (two stacked amber banners) | **Mostly fixed** | `#setupNudge` only shows after `ratesCustomized` (28598–28601) — see **new problem** CONV-4 |
| DASH-1 (nine empty cards on day one) | **Fixed** | `#dashFirstRun` checklist replaces launchpad when 0 saved jobs (13781–13996) |
| AUTH-8 (backdrop wipe) | **Partially fixed** | Backdrop close blocked when form has content (AUTH-8 comment path) |
| AUTH-9 (no legal consent) | **Fixed** | `#authLegalLine` on signup (6738) |
| AUTH-10 (password rule invisible) | **Fixed** | `#authPwHint` shown on signup |
| SET-4 (demo banner → Brand) | **Fixed** | Demo banner → Rates → Money (29300–29301) |
| SET-1 (any Settings save = rates customized) | **Improved** | Signature compare before flipping `ratesCustomized` (23361–23362) |
| CMP-1 (compare unreachable) | **Restored** | Compare UI present on Jobs |
| Phase 4a/4c touch targets + partial focus traps | **Shipped** | Coarse-pointer CSS + `trapDialog()` on key modals |

**Still open from July 2 (still relevant):** AUTH-1 (mobile Log In hidden), AUTH-2 (plan intent dropped at signup), MOB-1 (`HISTORY_NAV = false`), Stripe Phase 3 dormant, legal draft banner, unverified rate data (`DATA-TO-VERIFY.md`).

---

## 3. Current funnel map (landing → first sent quote)

```
Landing "Get Started Free"
        │
        ▼
Auth signup (email+pw+confirm) ──or── Google / magic link
        │
        ▼  enterApp() → openDashboard()     ← not calculator
Dashboard first-run checklist (6 items, 2 pre-checked)
        │  user taps "Open the calculator"
        ▼
Calculator + demo-rates banner + empty state (3 sample chips)
        │  tap chip → price appears
        ▼
Save job (consumes 1 of 8 trial quotes) → optional Customer fields
        │
        ▼
Send PDF / share / e-sign
        │  if demo brand OR demo rates → #demoGuardModal
        ▼
Optional: Onboarding (company+county) → Setup wizard (5 steps)
        │  NOT auto-shown after signup (by design)
        ▼
Settings (rates / brand / account) for ongoing accuracy
```

**Minimum clicks to see a price after signup:** Auth → Dashboard → Open calculator → Sample chip ≈ **4 surfaces**.  
**Landing promise:** “Price your first job in under a minute” (dashboard subcopy, ~13481) — achievable *after* calculator open, not from the Get Started click.

---

## 4. Onboarding & signup — findings (conversion-focused)

### Priority legend
- **P0** — Blocks paid conversion or creates false/broken paths  
- **P1** — Material activation / drop-off risk  
- **P2** — Clarity / polish that compounds retention  
- **P3** — Nice-to-have

---

### CONV-1 — New users land on Dashboard, not the priced moment · **P1**

| | |
|--|--|
| **What** | After signup/login, `openDashboard()` always runs (25628, 25636, 28001). Calculator value is one more decision away. |
| **Why it hurts** | Landing CTAs say “Get Started Free”; dashboard says “under a minute”; the empty checklist still asks them to choose. Competitors gate on price books — Anchor’s advantage is *speed to a number*, currently delayed. |
| **Change** | **A (recommended):** First session with 0 jobs → `closeDashboard()` + open calculator with one sample chip auto-applied + soft toast “Sample job — edit or open Settings anytime.” Keep checklist as a dismissible strip on return to Home. **B:** Keep dashboard, but make the primary checklist CTA auto-open calculator *and* apply a sample (one gesture). |
| **Risk** | Low if gated on `savedCount === 0 && !sessionSeenFirstQuote`. Existing users unchanged. |
| **Measure** | `calculator_first_interaction` within 60s of `auth_signup_completed`; `job_saved` within 24h. |

---

### CONV-2 — “Get Started Free” never states trial terms · **P1**

| | |
|--|--|
| **What** | Landing CTAs (`#lpSignup`, `#lpHeroSignup`, `#lpCtaSignup`) = “Get Started Free”. Trial details (14 days · 8 quotes · no card) live only on Pricing (`TRIAL` @ 26143, copy @ 6335/6356). Auth subtitle: “Create your account — free, takes a minute” (25456). |
| **Why it hurts** | Users hit `#usageBadge` / paywall without prior expectation → surprise friction at quote #8 or day 15. |
| **Change** | Auth signup subtitle + one line under `#authSubmit`: “14-day Pro trial · 8 quotes · no card.” Optional: hero secondary line under CTA. Do **not** change the gold CTA label unless A/B testing (“Start free trial”). |
| **Risk** | None. |

---

### CONV-3 — Paid plan intent discarded at auth gate · **P1** (prior AUTH-2, still open)

| | |
|--|--|
| **What** | Logged-out “Start with Pro” → `openAuth("signup")` and returns; no `{plan, billing}` resume after `enterApp()` (26826–26831 path). |
| **Change** | Persist `pendingCheckout = { plan, billing }` in `sessionStorage` before auth; on successful signup/login (and after email confirm `SIGNED_IN`), if present → `startStripeCheckout(plan)` or show confirm sheet. |
| **Risk** | Medium until Stripe Phase 3 is live — until then, show “We’ll take you to checkout when payments are enabled” rather than dead 503 toast. |

---

### CONV-4 — Brand setup nudge is inverted · **P1** (regression from ONBD-12 fix)

| | |
|--|--|
| **What** | `#setupNudge` shows only when `ratesCustomized && incomplete` (28601). Typical new user has **demo rates + incomplete brand** → only `#demoBanner` shows. Brand/setup path is buried in checklist / PFP menu. |
| **Why it hurts** | Customer PDF guard cares about **brand first**; the UI nudges **rates first** and hides brand until rates change. |
| **Change** | Single prioritized banner state machine: (1) !onboarded → “Add your company name for customer PDFs” → onboarding; (2) onboarded && !ratesCustomized → “Sample rates in use” → Rates; (3) else hide. Never stack two. |
| **Risk** | Low — restore ONBD-12 single-banner intent with correct priority. |

---

### CONV-5 — Mobile landing hides Log In · **P1** (prior AUTH-1, still open)

| | |
|--|--|
| **What** | `@media (max-width: 639px) { #lpLogin { display: none } }` (2644–2646). Returning contractors only see “Get Started Free” → signup mode. |
| **Change** | Keep Log In visible on mobile (text button beside gold CTA), or make hero secondary “Already have an account? Log in.” Pricing page already keeps `#prLogin`. |
| **Risk** | None. |

---

### CONV-6 — Pricing trial CTAs for logged-in users are a dead end · **P1**

| | |
|--|--|
| **What** | `#lpPricingTrialCta` / `#lpPricingFinalCta` when `currentUser`: only `closeLanding()` (27885, 27894) — does **not** `closePricing()` or open app. |
| **Change** | `closePricing(); closeLanding(); openDashboard()` (or calculator). |
| **Risk** | Trivial bugfix. |

---

### CONV-7 — Funnel analytics blind spots · **P2**

| Gap | Impact |
|-----|--------|
| `auth_signup_completed` fires even when email confirm required and user never enters app (25627–25630) | Over-counts “signed up” |
| Google / magic-link never emit signup/login completed | Under-counts acquisition |
| `#obLater` skip untracked | Invisible abandonment |
| Checklist `data-fr` clicks untracked | Can’t see which first-run CTAs work |
| Plausible commented out (80–83) | No production funnel until enabled |

**Change:** Emit `auth_signup_completed` only when session exists; add `auth_identity_signed_in` for OAuth/OTP with `{ provider }`; track `onboarding_skipped`, `firstrun_cta_click`; enable Plausible when domain is final.

---

### CONV-8 — Email confirm is a dead end · **P2**

| | |
|--|--|
| **What** | “Check your email to confirm, then log in” — no **Resend confirmation** control. |
| **Change** | Add resend button calling `sb.auth.resend({ type: 'signup', email })` with cooldown. |

---

### CONV-9 — Onboarding still FL-county-heavy · **P2**

| | |
|--|--|
| **What** | 4 required fields including FL county combobox (6520–6584). Fine for FL-first GTM; friction for out-of-state trials. |
| **Change** | Keep company + city/state required; make county optional with “Sets FL materials tax — pick later in Settings.” Or soft-require only when state = FL. |

---

### CONV-10 — Setup wizard is 5 steps and rarely reached · **P2**

| | |
|--|--|
| **What** | Only auto-opens after onboarding submit (28414). Most users skip entire chain. Step 4 manufacturer screw editor is dense for day one. |
| **Change** | Collapse to: (1) Labor + margin, (2) “Verify top 3 rates” deep-link into Settings Unverified list, skip manufacturers until first export. Or replace wizard with checklist items only. |

---

### CONV-11 — Stripe + legal still gate real paid conversion · **P0** (ops, not UX code)

| Item | Source |
|------|--------|
| Checkout returns 503; toast cites `PHASE_3_SETUP.md` (26856) — operator copy | Phase 3 checklist |
| Legal draft banner on Terms/Privacy | `PRELAUNCH_REVIEW.md`, `#legalScreen` |
| Unverified demo rates still default | `DATA-TO-VERIFY.md` |

Ship UX conversion work **in parallel**, but paid conversion will not move until these three are done.

---

## 5. Settings — findings

### Inventory (current IA)

```
Settings (#adminModal)
├── Setup          → Brand | Job Defaults | Manufacturers
├── Customers      → list / detail (manual save)
├── Rates & Pricing → Money & Tax | Labor | Window Rates | Doors (Swing/Sliding/Bifold)
└── Account & Plan → Plan (read-only) | Account (email, sign out)
    (+ Admin / Feedback / Resources — owner only)
```

Autosave on Setup/Rates (blur/change, ~600ms). Footer Save/Reset only on Setup+Rates. Search indexes many fields but **not** crew model or swing stage.

---

### SET-A — Sliding / bifold breakdown pencils missing · **P1**

| | |
|--|--|
| **What** | Pencil only if `(item && row.id !== "tax") \|\| row.isSwingDoor` (12502). Sliding/bifold rows use `isSlidingDoor` / `isBifoldDoor` (11400–11459) → **no edit pencil**. |
| **Change** | Extend `editable` + `openSettingsToItem` to map `sliding_doors_*` / `bifold_doors_*` → Doors leaf + correct inputs (`showRatesLeaf('doors')` + `showDoorType(...)`). |
| **Risk** | Low. |

---

### SET-B — Labor deep-link can land on a hidden leaf · **P1**

| | |
|--|--|
| **What** | `#laborEditBtn` scrolls to `#rates-section-labor` without always calling `showRatesLeaf('labor')`. Section is `display:none` when Money leaf is active. |
| **Change** | Every jump path must: `showSettingsTab('rates'); showRatesLeaf(leaf); [showDoorType]; scroll; highlight`. Audit `openSettingsToItem`, labor button, search `jump()`. |
| **Risk** | Low. |

---

### SET-C — Tax vs county split across tabs · **P1**

| | |
|--|--|
| **What** | County on Setup → Brand; `#adminTax` on Rates → Money. Hint cross-references Brand (8446) but no jump control. |
| **Change** | On Money & Tax: show read-only “Tax from {County}” + “Change county →” button that jumps to Brand. Flash `#adminTax` when county updates. |

---

### SET-D — Search misses labor crew fields & swing stage · **P2**

| | |
|--|--|
| **What** | Index covers Money fields heavily; crew size / pay rate / mobilization / swing stage poorly or not indexed. |
| **Change** | Add Field entries + synonyms (“crew”, “hourly”, “markup”, “margin”, “swing stage”). |

---

### SET-E — Save button vs autosave ambiguity · **P2**

| | |
|--|--|
| **What** | Autosave flashes `#settingsSavedFlag`; footer `#adminSave` duplicates. Customers tab uses manual save + toast. |
| **Change** | Prefer: remove redundant Save (keep Restore Defaults); add permanent microcopy “Changes save automatically.” Align Customers with autosave **or** keep manual but show the same Saved chip. |

---

### SET-F — Billing lives outside Settings · **P2**

| | |
|--|--|
| **What** | Account → Plan is read-only (“Plan changes land in the next release” @ 8829). Real Stripe portal is `#pfpManageBilling` in the avatar menu. |
| **Change** | When subscription exists, surface “Manage billing” inside Plan leaf (same handler as PFP). Hide stale “next release” copy once Phase 3 is live. |

---

### SET-G — Mobile: three horizontal nav strips in Rates · **P2**

| | |
|--|--|
| **What** | Tab rail + Rates leaf pills + door-type pills all `overflow-x: auto`. |
| **Change** | On `<640px`, use a single sticky section picker (select or vertical list) instead of triple pills; keep desktop leaf nav. |

---

### SET-H — Destructive action inconsistency · **P2**

| Action | Confirm? |
|--------|----------|
| Restore Defaults | Yes |
| Sign out (wipes local caches) | **No** (25671+) |
| Delete manufacturer | **No** |

**Change:** Confirm sign-out and manufacturer delete when brand is referenced.

---

### SET-I — Door enable toggles duplicated · **P3**

Job Defaults (`#adminSwingEnabledDefault` etc.) and Rates → Doors (`#adminSwingEnabled` etc.) edit the same state. Keep enable on Doors; Job Defaults = link only.

---

### SET-J — Naming clarity · **P3**

| Current | Prefer |
|---------|--------|
| Window Rates | Materials & fees |
| Money & Tax (contains Impact labor ×) | Move Impact labor × into Labor leaf |
| Account & Plan | Keep; rename leaf “Subscription” |

---

## 6. Overall UI/UX — findings

### UX-1 — Upsell modal behind dashboard · **P0**

| | |
|--|--|
| **What** | `#upsellModal` is `z-[55]`; `#dashboardScreen` is `z-[74]` (8102, 6805). Upsell from Jobs compare / quota while dashboard open can render **invisible**. |
| **Change** | Raise upsell to `z-[85]` (above dashboard/pricing, below auth `z-90`) **or** `closeDashboard()` before `showUpsell()`. |
| **Risk** | Low; high impact on paid conversion prompts. |

---

### UX-2 — Four overlapping navigation systems · **P1**

Calculator header · Dashboard · Mobile tab bar · Account menu. Labels disagree (“Open Calculator →” vs “Open calculator” vs “New quote” vs “New Job”).

**Change:**  
- Mobile: tab bar is canonical (Home / Jobs / Shopping / Quote FAB / Account).  
- Rename “More” → “Account”.  
- Unify action label: **New quote** everywhere.  
- Demote duplicate header pills on `<640px` (already partial).

---

### UX-3 — Modal focus / Escape incomplete · **P1**

`trapDialog()` covers auth, upsell, job details, PDF, etc. **Missing:** Settings, save job, read plan, buck, feedback, demo guard, save conflict. Escape list similarly incomplete.

**Change:** One `openOverlay(el)` / `closeTopOverlay()` stack for all modals; enable `HISTORY_NAV` behind a short soak (MOB-1 still dormant @ 14526).

---

### UX-4 — `user-scalable=no` · **P1** (a11y)

Viewport meta (line 5) blocks pinch-zoom on a number-heavy app. PDF has in-modal zoom; global zoom should be allowed (WCAG 1.4.4).

---

### UX-5 — Native `confirm()` breaks visual system · **P2**

Delete job, new quote, restore defaults, void e-sign still use browser confirms. Replace with branded modal pattern already used by `#demoGuardModal`.

---

### UX-6 — Dual plan-upload modals · **P2**

`#readPlanModal` and `#buckModal` are near-duplicates. Merge into one “Upload schedule” flow with buck list as a result step.

---

### UX-7 — First-run hides launchpad entirely · **P2**

`_dashFirstRunActive` hides launchpad (13996). Good for focus; hides Shopping / E-sign discovery.

**Change:** After checklist item “Price your first job” completes, reveal 2–3 muted launchpad cards below the checklist.

---

### UX-8 — Performance / feel of first visit · **P2**

~1.7MB / ~30k-line `index.html` + Tailwind Play CDN at runtime. Hurts TTI on field phones — the primary conversion device.

**Change:** Pre-build Tailwind (branch `claude/tailwind-build` may exist); defer jspdf until export; lazy-load admin/resources. Not a visual redesign — a snappiness win on the signup funnel.

---

### UX-9 — Operator-facing Stripe toast · **P1** until Phase 3

Replace `PHASE_3_SETUP.md` toast with user copy: “Payments aren’t available yet — email us / try the free trial.”

---

### UX-10 — Protect what’s working

Do **not** regress:

1. Sample chips → instant price  
2. Sticky `#mtotalBar` on mobile  
3. Honest landing (no fake social proof)  
4. Endowed-progress checklist (2/6 pre-checked)  
5. Demo export guard modal  
6. Settings search + leaf IA (improve, don’t scrap)  
7. Opt-in onboarding (no forced 14-field wall)

---

## 7. Recommended implementation phases (for your approval)

No calendar estimates — scoped by **invasiveness** and **dependency**.

### Phase A — Conversion quick wins (low invasiveness)

| # | Item | Depends on |
|---|------|------------|
| A1 | Fix logged-in pricing CTAs (CONV-6) | — |
| A2 | Fix upsell z-index (UX-1) | — |
| A3 | Show Log In on mobile landing (CONV-5) | — |
| A4 | Trial terms on auth subtitle (CONV-2) | — |
| A5 | User-facing Stripe dormant copy (UX-9) | — |
| A6 | Single banner priority: brand before rates (CONV-4) | — |
| A7 | Funnel event fixes (CONV-7) | Plausible enable (ops) |

**Outcome:** Fewer dead ends; clearer expectations; visible paywall prompts again.

---

### Phase B — Time-to-first-price (medium)

| # | Item |
|---|------|
| B1 | Post-signup → calculator + sample applied (CONV-1) |
| B2 | Resume pending checkout after auth (CONV-3) — after Stripe live |
| B3 | Soften FL county requirement (CONV-9) |
| B4 | Checklist CTA analytics + optional reveal launchpad cards (UX-7) |
| B5 | Resend confirmation email (CONV-8) |

**Outcome:** Activation metric: `% of signups with calculator_first_interaction < 60s` and `job_saved < 24h`.

---

### Phase C — Settings correctness (medium)

| # | Item |
|---|------|
| C1 | Sliding/bifold pencils + leaf activation (SET-A, SET-B) |
| C2 | Tax ↔ county jump (SET-C) |
| C3 | Expand search index (SET-D) |
| C4 | Autosave copy / Save button cleanup (SET-E) |
| C5 | Manage billing in Plan leaf (SET-F) |
| C6 | Sign-out + mfr delete confirms (SET-H) |

**Outcome:** Calculator → Settings jumps always work; tax/labor discoverable.

---

### Phase D — UI cohesion (medium–high)

| # | Item |
|---|------|
| D1 | Unify New quote labeling + Account tab rename (UX-2) |
| D2 | Overlay stack + Escape + soak HISTORY_NAV (UX-3) |
| D3 | Allow pinch zoom (UX-4) |
| D4 | Branded confirms (UX-5) |
| D5 | Merge plan-upload modals (UX-6) |
| D6 | Mobile Rates nav simplification (SET-G) |

---

### Phase E — Business blockers (you / ops)

| # | Item |
|---|------|
| E1 | Complete `PHASE_3_SETUP.md` (Stripe products, secrets, webhook) |
| E2 | Attorney review — remove draft legal banner |
| E3 | Walk `DATA-TO-VERIFY.md` — replace sample rates for production trust |
| E4 | Supabase: leaked-password protection + auth redirect URLs (`PRELAUNCH_REVIEW.md`) |
| E5 | Enable Plausible |

---

## 8. Suggested decision checklist (reply with choices)

Use this when you want implementation to start:

- [ ] **CONV-1 path:** A (auto sample in calculator) / B (checklist one-tap sample) / defer  
- [ ] **CONV-4:** Approve brand-first single banner  
- [ ] **Phase A:** Approve all quick wins as one PR  
- [ ] **Stripe:** Phase 3 live before CONV-3 checkout resume? Y/N  
- [ ] **Settings Phase C:** Approve C1–C3 as highest priority Settings work  
- [ ] **Out of scope for now:** Full Settings rename (SET-J), monolith split (UX-8), HISTORY_NAV soak  

---

## 9. Evidence index (key IDs)

| Concern | IDs / lines |
|---------|-------------|
| Trial constant | `TRIAL` 26143 |
| Post-auth dashboard | `openDashboard` 25628, 13362 |
| First-run checklist | `#dashFirstRun` 6860, 13780+ |
| Demo export guard | `demoExportBlocked` 18614 |
| Setup nudge gate | `renderSetupNudge` 28591–28601 |
| Upsell z-index | `#upsellModal` 8102 vs dashboard 6805 |
| Settings leaf nav | `#ratesLeafNav` 8383+ |
| Pencil editable check | 12502 |
| Mobile hide login | 2644–2646 |
| History nav flag | `HISTORY_NAV` 14526 |
| Stripe dormant toast | 26856 |

---

## 10. Relationship to July 2 master plan

| Document | Use for |
|----------|---------|
| `docs/ux-audit-2026-07/UX-AUDIT-MASTER-PLAN.md` (other branch) | Full 195-finding inventory, research citations, calculator/floors/AI/e-sign depth |
| **This doc** | Current-main delta · conversion · settings · UI feel · phased approval plan |

If you want a single living backlog, merge: adopt Phase A–E here as the **execution queue**, and keep Appendix A as the long-tail backlog for surfaces not covered in this request (repeating floors, AI plan-read, versioning, photos).
