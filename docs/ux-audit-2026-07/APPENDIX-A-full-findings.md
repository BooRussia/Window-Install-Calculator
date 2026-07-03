# Appendix A — Full Findings (UX Audit, July 2026)

Every finding from the multi-agent audit, verbatim, with evidence and verifier verdict.
All `index.html` line numbers refer to branch **`claude/repeating-floors`** (PR #39) at commit `696e3e5`.
Verdicts: every finding was re-checked first-hand by an independent adversarial verifier agent —
**CONFIRMED** = evidence re-verified against the code; **ADJUSTED** = directionally right, facts corrected in the note.
Zero findings were rejected on verification.


## Section: landing-auth

**Summary:** The first-touch surface is unusually strong on message and honesty: the landing states who it's for and what it does before any ask (eyebrow + three-step 'How it works'), lets visitors try a live slider preview with an explicit 'ballpark at sample rates' disclaimer, and replaces fake social proof with factual trust badges. Pricing is transparent (no-card trial, refund/cancel FAQs, status-aware plan cards with symmetric cancel/resume). The journey breaks down at the seams, though: on mobile — the primary device for this audience — the landing nav hides Log In entirely, so a returning contractor must guess that 'Get Started' (a signup form) hides the login toggle; and a visitor who picks a specific plan on the pricing page loses that intent at the signup gate, landing on the dashboard with no route back to checkout. The auth modal itself is functional but under-built: placeholder-only labels, 14px inputs that trigger iOS zoom, no dialog semantics/live-region error announcement, and a recovery flow whose only confirmation is a fleeting toast. None of these block the first-priced-job journey outright, but together they add avoidable friction exactly at the trust-formation moment.

**Strengths (do not regress):**
- Landing communicates what/for-whom before asking for signup: eyebrow 'Built for window & door installers' (4420), plain-language hero subhead (4424-4426), three-step How-it-works (4476-4498), and an interactive drag-to-your-job-size preview whose numbers are honestly labeled 'Ballpark at sample rates — your own rates make it exact' (4440, 4447, 4470) — textbook honest anchoring per trust-ethics.md §3.
- No dark patterns at the conversion point: trust badges are factual (Encrypted / US-hosted / FL code current, 4692-4717, with a code comment explicitly rejecting fabricated social proof at 4690-4691), trial is 'no credit card required' (4786), FAQ discloses trial-end behavior, refunds, and no-contract terms (4917-4958), and annual savings math (10× monthly = 'Save 16%', 22170, 4794) is true.
- Symmetric commitment done right (trust-ethics.md §5): renderPlans (23151-23240) is subscription-status-aware — Current/Canceling/Canceled/Past-due ribbons, a banner stating the exact cancel date with one-click Resume (23218-23235), and Manage/Cancel living on the same surface and tap-count as Upgrade.
- Auth plumbing fundamentals are correct: setAuthMode swaps autocomplete between current-password and new-password per mode (21502-21503), recovery-hash tokens are scrubbed from the URL/history immediately (23389-23395), the recovery link is intercepted before routing so the user lands on a coherent 'Set New Password' form and then drops straight into the app (23410-23419, 21620-21624), and the show-password toggle drives both password + confirm fields together (23367-23376).

### AUTH-1 — Log In is hidden from the mobile landing nav — returning field users have no visible sign-in path
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Landing nav, mobile breakpoint; index.html 2168-2172 (media query), 4354 (#lpLogin), 4428/4689 (hero + CTA band offer only 'Get Started Free')
- **Problem:** On <640px the CSS rule '.lp-nav .lp-scroll, .lp-nav #lpLogin { display: none !important; }' removes the Log In button. Every remaining CTA on the mobile landing (nav 'Get Started', hero 'Get Started Free', CTA band) opens the auth modal in SIGNUP mode. A returning, logged-out contractor on a phone — the app's core persona — must realize that the signup form contains a small 'Have an account? Log in' toggle (5187). The pricing screen keeps its #prLogin visible on mobile (the media query only targets #lpLogin), making the two lp-nav screens inconsistent.
- **Evidence:** Line 2168-2172: '@media (max-width: 639px) { .lp-nav .lp-scroll, .lp-nav #lpLogin { display: none !important; } }' with a comment calling Log In 'redundant on small screens'. Lines 4428, 4689: the only other landing CTAs are signup-labeled. Line 4767: #prLogin (pricing nav) is not in the hide rule.
- **Recommendation:** Restore a compact 'Log in' text link in the mobile landing nav (it fits: logo ≈89px + Pricing + CTA + toggle leave room at 375px), or open the auth modal in login mode with a prominent mode switch when the visitor has a prior-login marker in localStorage. At minimum match the pricing screen's behavior.
- **Principle:** Discoverability / recognition over recall (NN-g); mobile-first ergonomics — the primary action for a returning user must be visible, not nested behind an oppositely-labeled CTA
- **Breakage risk:** Nav width on ≤360px screens could wrap — verify no overflow; new visible control needs a [data-theme=light] check (run theme-parity).

### AUTH-2 — Plan choice is dropped at the signup gate — pricing CTA intent never resumes after auth
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** Pricing plan-card CTAs → startStripeCheckout 22716-22727; signup completion handleAuthSubmit 21657-21663; magic-link/Google returns 23400-23404
- **Problem:** A logged-out visitor who clicks 'Start with Pro' (annual) on the pricing page hits the auth gate: startStripeCheckout() calls openAuth('signup') and returns, discarding {plan, billing}. After signup, handleAuthSubmit runs enterApp(); openDashboard() — the user lands on the dashboard, nowhere near checkout, and must rediscover pricing via the avatar menu (24467-24470). If email confirmation is on, the gap widens further (confirm email → SIGNED_IN → dashboard, 23400-23404). The strongest purchase-intent moment in the funnel is silently abandoned.
- **Evidence:** 22721-22726: 'if (!currentUser) { window.track("checkout_auth_gate"...); openAuth("signup"); return; }' — no state saved. 21661: signup success path is 'await enterApp(); openDashboard(); return;'. No code path re-invokes startStripeCheckout after auth.
- **Recommendation:** Persist a pendingCheckout = {plan, billing, ts} to localStorage inside the auth gate; after SIGNED_IN/enterApp, if pendingCheckout is fresh (<1h), resume startStripeCheckout(plan, billing) (or land on #/pricing with the chosen card highlighted and a one-tap 'Continue to checkout' banner). Clear it on use or expiry.
- **Principle:** Continuity of intent / minimize interaction cost across interruptions (NN-g); every extra rediscovery step is funnel abandonment
- **Breakage risk:** Must not auto-fire a Stripe redirect the instant a user signs in for unrelated reasons (magic link from another device) — gate on freshness and same-tab; test with the ?checkout=success return handler (22790) so flows don't double-fire.

### AUTH-3 — Auth modal lacks dialog semantics, focus containment, and announced errors
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** authScreen 5139-5219; setAuthMsg/setRecMsg/setNewPwMsg 21473-21535; pw toggle 5159; Escape handler 24720
- **Problem:** The auth modal is a plain div: no role=dialog/aria-modal anywhere in the 25k-line file (grep: 0 hits), no focus trap (Tab walks into the landing page behind the backdrop), and the three message elements (authMsg 5172, recMsg 5199, newPwMsg 5215) are toggled from hidden with no aria-live/role=status — so a screen-reader user never hears 'Invalid login credentials' or 'Passwords don't match'; fields never get aria-invalid either (WCAG 3.3.1). The show-password toggle is tabindex="-1" (5159), unreachable by keyboard. Escape-close and initial focus (24720, 22147) are the only pieces done.
- **Evidence:** 5139: '<div id="authScreen" class="fixed inset-0 z-[90] hidden items-center justify-center p-5">' — no ARIA. 21473-21480: setAuthMsg only sets textContent + classes. 5159: 'tabindex="-1" aria-label="Show or hide password"'.
- **Recommendation:** Add role="dialog" aria-modal="true" aria-labelledby="authTitle" to the card; pre-mount authMsg/recMsg/newPwMsg as role="status" live regions (they already exist in DOM — just add the attribute); set aria-invalid + aria-describedby on the errored field; trap Tab within the modal while open and restore focus on close; drop tabindex=-1 from authPwToggle.
- **Principle:** WCAG 2.2 SC 3.3.1 Error Identification, SC 4.1.2; forms-and-inputs.md §5 (error association + live regions); accessibility focus-management contract
- **Breakage risk:** Focus-trap logic can conflict with the delegated data-auth-close backdrop click (23380-23382) and the three-form swap (login/recovery/new-pw) — retest all mode transitions; no visual change so light mode unaffected.

### AUTH-4 — Every auth and public-search input uses placeholder-as-label
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** authEmail 5154, authPassword 5157, authConfirm 5168, recEmail 5195, newPwInput 5209, newPwConfirm 5211, FL public search 4674
- **Problem:** All six auth fields have only placeholders ('Email', 'Password', 'Create a password', 'Confirm password'…) and no visible or sr-only label. Once the user types, the field's identity disappears — reviewing a signup with password + confirm both showing dots gives no cue which is which; browser autofill review is harder; and the FL lookup input (4674) has neither label nor aria-label, so screen readers announce an unnamed search box.
- **Evidence:** 5154: '<input id="authEmail" type="email" autocomplete="email" placeholder="Email" ...>' — no <label for>. 4674: '<input id="flPublicSearch" type="search" placeholder="Search FL#, series, or manufacturer…" ...>' — no label/aria-label.
- **Recommendation:** Add small visible labels above each auth field (the max-w-sm card has room; space-y-3 absorbs it), or minimally aria-label each input now and schedule visible labels; give flPublicSearch aria-label="Search Florida product approvals".
- **Principle:** Baymard — never use placeholder-only labels (forms-and-inputs.md §5, ux-pitfalls §4); WCAG 1.3.1/2.4.6
- **Breakage risk:** Modal grows ~80px taller — verify it still fits small viewports with keyboard open; new label text needs [data-theme=light] color overrides (theme-parity).

### AUTH-5 — Auth inputs are 14px — iOS Safari zooms the viewport on focus at the very first interaction
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** authEmail/authPassword/authConfirm/recEmail/newPwInput/newPwConfirm 5154-5212 (class 'text-sm'); .control base rule 121-127 sets no font-size
- **Problem:** All auth fields use Tailwind text-sm (14px) and the shared .control class defines no font-size, so on iPhone the viewport auto-zooms when the Email field is focused — the modal jumps and clips, and the user must pinch back out after submitting. The team already fixed this class of bug for settings fields ('.set-field input … { font-size: 16px; }' at 2477 and '#settingsSearch { font-size: 16px; }' at 2493) but the signup form — the first field a mobile visitor ever touches — was missed.
- **Evidence:** 5154-5158: 'class="control rounded-xl px-4 py-3 w-full text-sm ..."'. 121-127: .control block has background/border/transition only. 2477: existing 16px fix proves the pattern is known.
- **Recommendation:** Add '#authScreen input { font-size: 16px; }' (or swap text-sm → text-base on the six inputs); consider a global 'input.control { font-size: 16px }' sweep in a later phase.
- **Principle:** forms-and-inputs.md §8 — ≥16px inputs are the only accessible fix for iOS zoom-on-focus (never maximum-scale=1)
- **Breakage risk:** Minimal — inputs render slightly larger; check the pr-11 password field doesn't crowd the eye toggle, and confirm light-mode .control overrides (2865-2876) still apply.

### AUTH-6 — Reset-link / magic-link confirmation is a transient toast; the form silently snaps back to login
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** handleRecoverySubmit 21558-21591; setAuthMode clears authMsg at 21515
- **Problem:** After 'Send reset link' / 'Send magic link' succeeds, the code fires toast(`Reset link sent to ${email}`) then setAuthMode('login') — which wipes authMsg (21515) and re-shows the password login form. The only confirmation is a bottom-of-screen pill that disappears in seconds. A user who glances away sees… the same login form they started from, concludes nothing happened, and re-requests (Supabase then rate-limits with a raw 'For security purposes…' error). There is no persistent 'check your inbox' state and no resend affordance. Contrast: the signup-confirmation path does it right, setting a persistent ok-message after the mode switch (21662-21663).
- **Evidence:** 21575: 'toast(`Magic link sent to ${email}`);' 21580: 'toast(`Reset link sent to ${email}`);' then 21583-21584: 'setAuthMode("login"); document.getElementById("authEmail").value = email;' — no setAuthMsg call after the mode switch.
- **Recommendation:** Mirror the signup pattern: after setAuthMode('login'), call setAuthMsg(`Reset link sent to ${email} — check your inbox.`, 'ok'); optionally keep a dedicated 'sent' state in the recovery form with a resend button that respects the rate limit.
- **Principle:** Visibility of system status (Nielsen #1); missing-state checklist — every async action needs a persistent success state, not just an ephemeral toast
- **Breakage risk:** None functional — one-line ordering fix identical to the existing signup path; verify authMsg ok-color contrast in light mode.

### AUTH-7 — Third tier is 'Shop' on the plan cards but 'Unlimited' in the comparison table; table omits e-signatures despite 'Compare every feature'
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Comparison table header 4824 vs PLANS name 22207-22209; Pro card feature 22197 vs table body 4841-4844
- **Problem:** The 2026 repricing renamed the top tier to 'Shop' (PLANS: id 'unlimited', name 'Shop', $199) and the rendered plan cards say Shop — but the hand-maintained static comparison table on the same pricing screen still headers the column 'Unlimited' (4824). A buyer scrolling from cards to table can't line up the third column with any card. The table also promises 'Compare every feature… Everything you get at each tier' (4812-4814) yet has no row for 'Customer e-signatures', a headline Pro-card feature (22197) — so the two artifacts disagree on both names and contents.
- **Evidence:** 4824: '<th scope="col">Unlimited</th>'. 22207-22209: '{ id: "unlimited", name: "Shop", ... }'. Customer-facing rows 4841-4844 list share URLs/branding/photos but no e-sign row.
- **Recommendation:** Render the table <th> labels from PLANS[].name (single source of truth, as the PLANS comment at 22161-22163 intends), and add the 'Customer e-signatures' row (– / ✓ / ✓).
- **Principle:** Consistency & standards (Nielsen #4); trust-ethics §1 — a pricing surface that contradicts itself undermines belief in every other number
- **Breakage risk:** Plan names also appear in the in-app Resources/help guide and upsell copy — run resources-sync after renaming; static table is theme-styled already.

### AUTH-8 — A backdrop mis-tap dismisses the auth modal and openAuth wipes everything typed
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Backdrop 5140 (data-auth-close on the full-screen layer), delegated close 23380-23382, openAuth clears fields 22140-22143
- **Problem:** The entire screen outside the max-w-sm card is a dismiss target (5140), and on a phone the card occupies a minority of the viewport — a stray thumb tap mid-signup closes the modal instantly (no confirmation, correct per mis-tap doctrine) but reopening via any CTA runs openAuth(), which unconditionally blanks authEmail and authPassword (22141-22142). The user retypes email, password, and confirm from scratch. Slip-recovery, not slip-prevention, is the gap.
- **Evidence:** 22140-22142: 'setAuthMode(mode || "login"); document.getElementById("authEmail").value = ""; document.getElementById("authPassword").value = "";' on every open. 5140: '<div class="absolute inset-0 modal-backdrop" data-auth-close></div>'.
- **Recommendation:** Stop clearing field values in openAuth (clear only after successful auth or explicit sign-out); alternatively ignore backdrop dismissal when any auth field is non-empty (keep the X and Escape working).
- **Principle:** ux-pitfalls §9 — protect users from slips; error prevention beats re-entry (Nielsen #5); forgiveness by default
- **Breakage risk:** Persisting a typed password across open/close on a shared device is a minor privacy trade — acceptable within one page session; verify the signup↔login toggle still clears authConfirm (21508 already does).

### AUTH-9 — Signup collects credentials for a paid product with no Terms/Privacy consent line
`severity: low` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** authForm 5149-5188 (no legal microcopy); legal links exist only in the landing footer 4736-4739
- **Problem:** The signup form (which leads into a Stripe-billed subscription) never references Terms, Privacy, or the refund policy — the legal pages exist and are routable (data-legal-link footer buttons, #/privacy hash route at 23433) but are absent at the exact moment of account formation. For a product handling customer PII (homeowner names, addresses on quotes) this is both a trust signal and standard compliance hygiene.
- **Evidence:** 5170-5187: submit button → Google → magic link → mode toggle; no legal line anywhere inside authForm. 4736-4739: Terms/Privacy/Disclaimers/Cookies footer buttons on the landing only.
- **Recommendation:** Add one 11px line under the submit button in signup mode: 'By continuing you agree to our Terms and Privacy Policy' with the two links wired to the existing data-legal-link handlers.
- **Principle:** Trust-ethics §1/§5 — disclose material terms before commitment; industry-standard signup pattern
- **Breakage risk:** Legal links open the legal screen over the auth modal — check z-index stacking (authScreen is z-[90]) and that closing legal returns to the still-open auth modal.

### AUTH-10 — Password rules are invisible until submit fails; new-password form lacks the show-password toggle
`severity: low` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Signup validation 21648-21652; new-pw validation 21610-21611; toggle wired only to authPassword/authConfirm 23367-23373; newPwInput 5209
- **Problem:** The 6-character minimum surfaces only as a post-submit error ('Password must be at least 6 characters.'), violating reward-early/punish-late — there's no hint text under the field and no on-blur validation. The Set New Password form (5204-5216) has two masked fields and no eye toggle at all (authPwToggle is wired exclusively to the main form), so the very flow used by people who already fumbled a password gets the least typo protection.
- **Evidence:** 21649: 'if (password.length < 6) { setAuthMsg(...) }' — submit-time only. 23368-23373: toggle targets #authPassword/#authConfirm only; 5209-5212 has no toggle button.
- **Recommendation:** Add a static hint ('At least 6 characters') under the create-password field, validate on blur then live-once-errored, and reuse the eye-toggle component on newPwInput/newPwConfirm.
- **Principle:** forms-and-inputs.md §6 'reward early, punish late' (Konjevic/Baymard); password-UX: visibility toggle > blind confirm field
- **Breakage risk:** None significant; hint text needs light-mode color and the toggle button needs its hover colors in both themes.

### AUTH-11 — Raw Supabase error strings shown verbatim with no recovery guidance
`severity: low` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** handleAuthSubmit catch 21672-21673; handleRecoverySubmit catch 21585-21586; handleNewPasswordSubmit catch 21625-21626
- **Problem:** setAuthMsg(err.message || …) surfaces API-native strings: 'Invalid login credentials', 'Email not confirmed', 'For security purposes, you can only request this after 56 seconds'. None suggest the next step — a failed login doesn't point at 'Forgot password?' (which is right there), and 'Email not confirmed' doesn't offer to resend the confirmation. For a non-technical contractor audience, these dead-end messages are the difference between recovering and abandoning.
- **Evidence:** 21673: 'setAuthMsg(err.message || "Something went wrong.", "error");' — no mapping layer. Similar passthroughs at 21586 and 21626.
- **Recommendation:** Add a small error-map: invalid credentials → 'Email or password doesn't match — try again or reset your password' (and visually pulse the Forgot link); email-not-confirmed → offer resend via sb.auth.resend(); rate-limit → 'Wait a minute and try again.' Fall back to err.message for unknowns.
- **Principle:** NN-g error-message guidelines — human language, constructive next step; ux-pitfalls error-state doctrine
- **Breakage risk:** Error-string matching against Supabase messages is brittle across SDK upgrades — match on error.status/code where available, keep the raw-message fallback.

### AUTH-12 — Supabase-SDK-failure boot path silently dumps visitors into the raw demo calculator
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** boot() catch 23347-23356
- **Problem:** If window.supabase.createClient throws (CDN blocked, extension interference), boot hides the splash AND the landing screen and calls init() — a first-time visitor lands directly in the calculator with demo rates, no landing pitch, no auth, and no explanation beyond a console.warn. They can't sign in or understand what they're looking at; the offline pill logic elsewhere (21460-21471) is explicitly gated on sb existing, so no status indicator appears either.
- **Evidence:** 23349-23355: 'catch (e) { console.warn("Supabase unavailable — offline mode", e); document.getElementById("bootSplash").classList.add("hidden"); document.getElementById("landingScreen").classList.add("hidden"); init(); return; }'.
- **Recommendation:** Show a dismissible banner in this path ('Running in offline demo mode — sign-in is unavailable. Check your connection and reload.') and consider still showing the landing for never-authenticated visitors (localStorage has no profileSyncedAt) instead of the bare calculator.
- **Principle:** Visibility of system status; missing error/degraded-state design (empty/loading/error triad)
- **Breakage risk:** Must not break the intentional offline-local-mode for returning users who rely on it; banner needs light-mode styling.

### AUTH-13 — Monthly/Annual toggle misuses tab semantics; landing nav text buttons sit below 44px
`severity: polish` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Billing toggle 4792-4795 + setPeriod 23276-23291; landing nav buttons 4350-4354 (py-2, text-sm ≈ 36px tall)
- **Problem:** The billing toggle is marked role=tablist/role=tab with aria-selected but implements no tab keyboard pattern (no arrow-key movement, no tabindex roving) — screen-reader users are told 'tab' and get button behavior; the correct pattern for a two-state price switch is plain buttons with aria-pressed. Separately, the desktop nav's text buttons (Pricing, How it works, FL Lookup, Log In) compute to ~36px tall — under the 44px floor that the codebase itself cites for modal-close (1690-1692).
- **Evidence:** 4792-4794: 'role="tablist" … role="tab" aria-selected="true"'; 23290-23291 wires plain click only. 4350-4353: 'px-2 sm:px-3 py-2' on 14px text.
- **Recommendation:** Swap role=tab/tablist for aria-pressed buttons (2-line change), and add min-height 44px (or py-2.5+) to lp-nav text buttons.
- **Principle:** ARIA APG — don't claim a pattern you don't implement; Apple HIG / WCAG 2.5.8 target size ≥44px
- **Breakage risk:** Toggle CSS keys off .active class not ARIA, so visuals unaffected; taller nav buttons could nudge the 64px nav height — verify h-16 still fits.

## Section: onboarding-firstrun

**Summary:** The opt-in-setup redesign killed the forced 14-field signup wall (good), but it left the first-run journey with no coordinated spine. A brand-new user lands on the dashboard — a surface that contains zero setup presence and zero demo-rates disclosure (both the demoBanner and setupNudge live only inside the calculator's #appBody), greets them as "Welcome back, Prime Window & Door," and whose only setup affordance (avatar menu → "Set up profile") silently opens the onboarding screen underneath the dashboard because of z-index ordering, so the click appears to do nothing. Once in the calculator, two competing amber banners nudge toward two different destinations, one of them with copy that is factually false ("Finish setup to unlock customer PDFs & save jobs" — nothing is locked). Most seriously, the app's honesty system around demo pricing has holes at the moment of truth: the customer-PDF guard checks only demo BRANDING, never demo RATES, and the "sample rates" banner is permanently killed by merely clicking Next through the wizard or saving Settings once — so a contractor can absolutely hand a real customer a quote priced on Ocala demo numbers with no warning. There is also no guided "price your first job" moment: the wizard's final "Start Quoting" button just closes the overlay, and the only re-viewable "how this app works" help (the Resources guide) is gated behind isAdmin(), leaving regular users with a one-shot, non-repeatable tour.

**Strengths (do not regress):**
- Demo-brand hygiene in onboarding is genuinely thoughtful: showOnboarding blanks the seeded "Prime Window & Door"/Ocala placeholders so a fresh user must type their real identity (DEMO_BRAND + realOrBlank, lines 23516–23533), and exportCustomerPDF has a last-line guard against shipping the demo company name (15729–15741). Later phases must not regress either half.
- Onboarding form feedback is best-in-file: live per-field ✓/✗ chips, a progress counter ("2 of 4 required fields complete"), an amber advisory for malformed optional fields, and a submit button whose label names the exact blocker ("Complete 2 more required fields") — renderOnboardingStatus 23611–23701 — plus instant county→sales-tax feedback (updateObCountyTax 23738–23749).
- The tappable "Unverified ✎" badge on every demo-priced breakdown row jumps straight to that rate in Settings (verifyBadge 10196–10200, delegated handler 24136–24138). This verify-in-context loop is the single best demo-rates honesty mechanism in the app and should become the backbone of the rates story, not an accessory.
- The setup wizard's copy is honest and low-pressure where it counts: step 2 plainly says rates are samples and "there's no rush" (5069–5070), step 5 explains the Unverified tag system (5124), skipping keeps the demo banner alive by design (completeSetup comment 23841), and the nudge-dismiss state is thoughtfully scoped (localStorage, auto-cleared on true completion, 23879–23899).

### ONBD-1 — Customer-facing exports warn about demo branding but never about demo pricing
`severity: critical` · `kind: flaw` · `effort: M` · `verdict: ADJUSTED`

- **Where:** exportCustomerPDF guard, index.html 15725–15741; requireSavedJobForExport 15716–15723
- **Problem:** A user who completed the profile (onboarded=true, real company name) but skipped or clicked through rate setup can generate and send a customer quote priced entirely on sample rates with zero warning at export time. The only export-time guard checks the company NAME (line 15733: !DATA.config.onboarded || cn === DEMO_BRAND.companyName); no export path checks ratesCustomized or whether any included cost item still has unverified=true. This is the exact accident the brief asks about, and it is the moment of maximum trust damage — a real customer receives a real-looking price built on Ocala demo numbers.
- **Evidence:** Line 15733: `if (!DATA.config.onboarded || cn === DEMO_BRAND.companyName)` is the sole gate before generating the customer PDF; nothing in exportCustomerPDF or requireSavedJobForExport (15716–15723) inspects DATA.config.ratesCustomized or costItems[].unverified. DEFAULT_DATA seeds 14 cost items with unverified:true (8112–8185).
- **Recommendation:** At every customer-facing output (customer PDF, share, e-sign link creation, public quote URL), if any cost item contributing to THIS quote is still unverified, show a styled interstitial: "3 of your rates are still sample numbers (Caulking, Labor, Screws) — this price may not match your real costs." with [Review rates] (opens the Unverified jump list) and [Send anyway]. Keep it per-quote and computed from item.unverified, not from the coarse ratesCustomized flag.
- **Principle:** Rams: good design is honest — never make an estimate look more precise than it is; principles.md: 'can I trust this number?' is the central question for a cost tool
- **Breakage risk:** Adds friction to power users who knowingly quote on defaults — must be dismissible per quote and disappear once items are verified; e-sign and public-quote paths need the same check or the loophole just moves; light-mode styling for the new interstitial (theme-parity) and resources-sync for the new behavior.
- **Verifier adjustment:** Core claim fully verified: 15733 `if (!DATA.config.onboarded || cn === DEMO_BRAND.companyName)` is the only export-time gate; grep shows ratesCustomized appears only at 7523/19546/23841/23861/23876 and no `unverified` read exists in any export path (requireSavedJobForExport 15716–15723 checks saved-job status only). One fact off: DEFAULT_DATA seeds 13 cost items with unverified:true (lines 8112, 8119, 8127, 8133, 8139, 8149, 8163, 8169, 8176, 8182, 8183, 8184, 8185 — the entire costItems array), not 14. The accident scenario stands: onboarded user with real company name + skipped rate setup exports a customer PDF on all-demo pricing with zero warning.

### ONBD-2 — The dashboard — where every new user lands — carries no setup prompt and no demo-rates disclosure
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** dashboardScreen 5227–5360 (fixed inset-0 z-[74] overlay); demoBanner 5827 and setupNudge 5836 live inside #appBody (5824)
- **Problem:** Signed-in users land on the dashboard (enterApp→openDashboard, 21661/23403), but both first-run signals — the amber sample-rates banner and the finish-setup nudge — are markup inside #appBody, which the full-screen opaque dashboard completely covers. The dashboard hero, KPI strip, and launchpad cards (5249–5346) contain no setup card, no demo warning, nothing. A new user's primary surface is silent about the two most important facts of their account state: profile not set up, prices are samples. They only discover this if they happen to open the calculator.
- **Evidence:** dashboardScreen at 5227 is `fixed inset-0 z-[74] ... background:#020617`; demoBanner (5827) and setupNudge (5836) are children of #appBody (5824) with no dashboard counterpart; renderDashboard 10872–10889 and renderDashLaunchpad 11132–11153 render no setup/demo element; DASH_CARDS (10898+) has no setup entry.
- **Recommendation:** Add a first-run hero card or slim banner to the dashboard launchpad shown while (!onboarded || any unverified rates): "You're set up with sample rates — 2 steps to real quotes" with one CTA into startSetupFlow. Reuse the existing nudge copy system so calculator and dashboard state stay in sync (single renderSetupNudge that paints both).
- **Principle:** principles.md #4: no persistent anchor — the user doesn't know where they are or what happens next; NN/g empty-state jobs: status + teach + pathway
- **Breakage risk:** Dashboard card order was recently hand-tuned (Jobs/Shopping/Calibration first, PR #38) — a setup card must not permanently occupy a slot after setup completes; needs [data-theme=light] overrides (theme-parity) and resources-sync.

### ONBD-3 — "Set up profile / Finish setup" from the dashboard avatar menu opens the setup screens UNDERNEATH the dashboard — the click visibly does nothing
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** pfpFinishSetup handler 24462–24465; startSetupFlow 23915–23919; z-index: onboardScreen z-[70] (4971), setupScreen z-[72] (5040), dashboardScreen z-[74] (5227)
- **Problem:** The pfp menu is shared between the app header and the dashboard avatar (comment 5462–5464). On the dashboard, tapping "Set up profile" runs closePfpMenu(); startSetupFlow() → showOnboarding() removes .hidden from onboardScreen (z-70), but the opaque dashboardScreen (z-74) stays visible on top. The menu closes and nothing appears — a dead button on the only setup entry point the landing surface has. Same failure for showSetupWizard (z-72) when onboarded, and for the exportCustomerPDF confirm→startSetupFlow path if triggered from a dashboard context.
- **Evidence:** startSetupFlow (23915–23919) and showOnboarding (23550–23552) never hide dashboardScreen; the reverse direction IS handled — openDashboard explicitly hides onboardScreen/setupScreen (10850–10852) — proving the layering conflict was known in one direction only. Handler at 24462: `closePfpMenu(); startSetupFlow();` with no closeDashboard().
- **Recommendation:** In startSetupFlow(), call closeDashboard() (10867–10870) before showing either screen, and on completion/exit return the user to wherever they came from (store a one-shot origin flag: reopen dashboard vs reveal calculator). Alternatively raise onboard/setup z-index above 74 — but the explicit close keeps stacking sane.
- **Principle:** states-and-feedback §1: every interactive element needs a designed response state — a control whose activation produces no visible change reads as broken (NN/g: visibility of system status)
- **Breakage risk:** Must decide the return surface after Submit/Skip — today completeSetup just reveals whatever is underneath; if you closeDashboard first, finishing setup would now dump users into the calculator, which changes the current (accidental) dashboard-return behavior. Verify the calculator init state is sane when reached this way.

### ONBD-4 — Setup nudge copy is false: nothing is actually locked behind setup
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** setupNudge text, index.html 5840
- **Problem:** The bar says "Finish setup to unlock customer PDFs & save jobs." but setupComplete gates nothing anywhere in the file: saving jobs works immediately, and customer PDFs generate after any save (the only extra step is the demo-brand confirm, which is keyed to onboarded/company-name, not setup). Users who test it discover the claim is false within a minute, teaching them the app's banners lie — which then undermines the demo-rates banner, the one warning they genuinely must heed.
- **Evidence:** Grep for setupComplete shows only wizard bookkeeping (7522, 19619, 23734, 23860, 23896, 23917) — no export or save path reads it. requireSavedJobForExport (15716–15723) gates on saved-job status only; saveCurrentJob/confirmSaveJob have no setup check. Nudge copy at 5840.
- **Recommendation:** Make the copy truthful and benefit-framed: "You're quoting with sample rates — finish setup so prices match your real costs." (When !onboarded, keep the branding angle: "Add your company info so quotes carry your name, not ours.") Sync the wording with whatever ONBD-1 ships.
- **Principle:** Rams: good design is honest — don't make the product appear more capable (or more locked) than it is; a calm interface and a trustworthy interface are the same interface (principles.md)
- **Breakage risk:** Copy-only, but the nudge string is referenced conceptually in the Resources guide — run resources-sync; nudge CTA label logic (23903–23904) stays valid.

### ONBD-5 — Clicking Next through the wizard (or saving Settings once) permanently certifies demo rates as 'customized'
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** completeSetup 23842–23871 (esp. 23847–23851, 23861); saveAdmin 19545–19546; renderDemoBanner 23873–23877
- **Problem:** completeSetup(false) fires when the user reaches step 5 and taps "Start Quoting" — even if they never touched a field. Because setupLabor/setupMargin are prefilled (23817–23818), the non-NaN writes always run: labor's unverified flag is cleared (23850) and ratesCustomized=true (23861), which hides the sample-rates banner forever (23876) and toasts "Setup complete" — while all 14 material cost items remain demo numbers. saveAdmin does the same on ANY Settings save regardless of what changed (19546). The app's primary honesty signal is destroyed by mere navigation, directly feeding the ONBD-1 accident.
- **Evidence:** 23847–23851: `if (!isNaN(labor) && labor >= 0) { ...crewPayRatePerHr = labor; li.unverified = false; }` runs on untouched prefills; 23861: `if (!viaSkip) DATA.config.ratesCustomized = true;`; 19546: `DATA.config.ratesCustomized = true;` unconditionally in saveAdmin; banner visibility solely `ratesCustomized || demoBannerDismissed` (23876).
- **Recommendation:** Derive the banner from ground truth instead of a flag: show it while any costItems[].unverified is true (or count them: "9 rates still on sample numbers"). In completeSetup, only clear labor.unverified / set ratesCustomized when the value actually differs from the prefill (dirty-check, as saveAdmin's labor path already does at 19400). Keep ratesCustomized purely as an analytics breadcrumb.
- **Principle:** Rams: honest design; states-and-feedback §1 — success state must reflect what actually happened, not what the flow assumes
- **Breakage risk:** Existing users with ratesCustomized=true but lingering unverified items would see the banner return — arguably correct but surprising; needs a count-based, calmer banner to avoid feeling naggy, plus resources-sync (the guide documents when the banner disappears).

### ONBD-6 — The profile onboarding screen has no exit — an opt-in flow that traps the user
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** onboardScreen 4971–5037; grep confirms no close control or Esc handler (only openDashboard at 10850 ever hides it)
- **Problem:** onboardScreen is a full-screen fixed overlay whose only interactive exit is the submit button — which stays disabled until 4 required fields validate (23693–23695). A user who taps "Set up profile →" from the calculator nudge out of curiosity, then decides "not now" (they're on a roof, they don't remember their county), has no Skip, no ×, no Cancel, no Esc — only completing the form or reloading the app. The setup wizard right next to it got this right ("Skip for now", 5129); onboarding didn't.
- **Evidence:** Lines 4971–5037 contain a single button (obSubmit); grep for onboardScreen shows hide operations only in submitOnboarding (23727–23729) and openDashboard (10850); no keydown/Escape or backdrop-close wiring exists for it (contrast authScreen's data-auth-close backdrop, 5140).
- **Recommendation:** Add a quiet "Not now" text button below the card (and Esc handling) that hides the screen, calls renderSetupNudge(), and tracks onboarding_abandoned. Since the flow is opt-in and re-entry is one tap away, no confirmation is needed.
- **Principle:** NN/g usability heuristic #3: user control and freedom — clearly marked exit for every user-initiated state; states-and-feedback §6: don't make escape undiscoverable
- **Breakage risk:** Trivial; just ensure the exit doesn't set onboarded=true, and that the nudge stays visible afterward. Light-mode styling for the new button (theme-parity).

### ONBD-7 — "Skip for now" actually means "never again": it marks setup complete and removes every path back to the wizard
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** setupSkip handler 24443 → completeSetup(true) 23842–23871 (23860); renderSetupNudge 23896–23911; startSetupFlow 23915–23919
- **Problem:** Skipping sets setupComplete=true (23860), so the nudge bar hides, the pfp "Finish setup" item hides (23906–23908), and startSetupFlow toasts "Setup already complete" (23918). The label promises deferral; the system records completion. The only way to ever see the wizard again is resetSetup — a testing helper buried in Settings behind a confirm() (19613–19625). A user who skipped on day one and wants the guided rates walkthrough on day three has lost it, leaving raw Settings as their only route.
- **Evidence:** completeSetup(viaSkip): `DATA.config.setupComplete = true;` runs for both paths (23860); incomplete-check at 23896 keys nudge + pfp visibility to setupComplete; startSetupFlow's else-branch toast at 23918.
- **Recommendation:** Introduce a distinct skipped state (e.g. setupSkippedAt timestamp): skip hides the nudge for the session but keeps the pfp "Finish setup" item alive while rates remain unverified, and startSetupFlow reopens the wizard instead of toasting. Reserve setupComplete=true for actual completion.
- **Principle:** Label–behavior honesty (Rams); ux principle of recognition over recall — a guided path should stay discoverable, not become a one-shot
- **Breakage risk:** renderSetupNudge's auto-clear of the dismiss flag (23899) assumes the binary complete/incomplete model — retest so the nudge doesn't resurrect forever for skippers; toast copy at 23870 and the Resources guide description need updating (resources-sync).

### ONBD-8 — First screen greets a brand-new user with "Welcome back, Prime Window & Door"
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderDashboard 10874–10876; DEFAULT_DATA brand seed 7562
- **Problem:** For an un-onboarded account, DATA.config.brand.companyName is the seeded demo value "Prime Window & Door" (7562), and the dashboard hero renders `Welcome back, ${brand.companyName}` (10876). A user 10 seconds into their first session is (a) welcomed "back" and (b) addressed as a company that isn't theirs — a confusing, trust-denting first impression that also leaks the demo identity the onboarding code works hard to blank out (23516–23521).
- **Evidence:** 10876: `greet.textContent = brand.companyName ? `Welcome back, ${brand.companyName}` : "Welcome back";` with no onboarded check; DEFAULT_DATA.config.brand.companyName = "Prime Window & Door" (7562).
- **Recommendation:** When !DATA.config.onboarded (or companyName === DEMO_BRAND.companyName), render "Welcome to Anchor" with a subline that doubles as the ONBD-2 setup pathway ("Let's set up your company and rates"). Apply the same demo-name suppression anywhere else brand.companyName surfaces for fresh accounts.
- **Principle:** principles.md — clarity: the content should be instantly understandable; honest design (don't present placeholder data as the user's own)
- **Breakage risk:** None functionally; verify applyBrandToUI call sites don't reintroduce the demo name elsewhere on first run; copy tweak only, but check light-mode if any new styled subline is added.

### ONBD-9 — Demo-brand export guard is a native confirm() with inverted button semantics — Cancel performs the action
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** exportCustomerPDF 15733–15741
- **Problem:** The guard uses window.confirm with the legend "OK = set up now · Cancel = generate with demo branding anyway". The affirmative button (OK) ABORTS the user's intent (export) and detours to setup; the dismissive button (Cancel) SHIPS a demo-branded PDF to a customer. Users pattern-match OK=proceed under time pressure, so the control does the opposite of what muscle memory expects in both directions. It's also an unstyled browser dialog inside an app with a polished modal system, and its OK path calls startSetupFlow — which, from a dashboard-side export, opens the setup screens under the dashboard (ONBD-3).
- **Evidence:** 15734–15740: `const proceed = confirm("...OK = set up now · Cancel = generate with demo branding anyway"); if (proceed) { startSetupFlow(); return; } // else fall through and generate`.
- **Recommendation:** Replace with a styled modal: primary gold [Set up my branding], secondary ghost [Use demo branding this once], and a preview line of what the customer will see ("Quote will read: Prime Window & Door, Ocala, FL"). Merge it with the ONBD-1 rates interstitial so export shows at most ONE combined warning.
- **Principle:** ux-pitfalls §9 territory via states-and-feedback: routine confirms habituate reflexive confirmation and cause the error they guard against; one clear primary action per decision
- **Breakage risk:** Export becomes async (modal instead of blocking confirm) — audit callers for assumptions about synchronous fall-through; new modal needs light-mode overrides (theme-parity) and resources-sync.

### ONBD-10 — No guided first-quote moment: the wizard's "Start Quoting" button doesn't start a quote
`severity: medium` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** setupNext label 23803; completeSetup 23842–23871; calculator first-run empty states 5855 (liveRecap), 10502–10531
- **Problem:** The wizard's final CTA reads "Start Quoting", but completeSetup only hides the overlay and re-renders — it doesn't open the calculator, open the rail, or focus the LF input. Post-setup, the user faces the calculator's passive empty state ("Add your window footage to see your price", 10508 — static text with no pathway, and on mobile the footage input lives inside the collapsed rail behind a hamburger). The journey's climax — first priced job — is left to the user to reverse-engineer. There is no sample job, no coach mark, no focused input.
- **Evidence:** 23803: `setupNext.textContent = setupStep === SETUP_STEPS ? "Start Quoting" : "Next →"`; completeSetup body (23842–23868) contains no navigation/focus call; liveRecap empty state is plain textContent with no action (10506–10509); mobile summary CTA "Set up your job →" (10523) relies on the sticky bar being noticed.
- **Recommendation:** Make "Start Quoting" literal: navigate to the calculator, expand the rail's Openings section, and focus the LF field (mobile: open the job editor sheet). Also make the liveRecap empty state a real first-use empty state — tappable, jumping to the same place — so the pathway exists for users who never ran the wizard.
- **Principle:** NN/g empty states — communicate status, teach, provide a direct pathway; principles.md #5: the user should always know what happens next
- **Breakage risk:** Focus/scroll behavior differs across the rail's pinned/overlay modes and mobile sheet — test both; auto-opening UI after wizard close must not fight the ONBD-3 return-surface fix; liveRecap becoming interactive needs a11y (button semantics) and light-mode check.

### ONBD-11 — The app's only "how it works" guide is admin-gated, and the one-shot wizard tour can never be replayed
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** resourcesTabBtn gating 16898 (+ comment 16929 'Owner-only'); pfpResources inside pfpAdminSection 5519–5534; Help section 5541–5554; wizard step 1 5054–5064
- **Problem:** Regular users' Help menu offers only domain education ("Window & door basics" → learnScreen) and feedback — the plain-English guide to how Anchor itself works (Resources tab, anchor-resources.json) is hidden unless isAdmin(). Meanwhile the only in-app explanation of the quoting workflow (wizard step 1's 4-step overview) appears once and becomes unreachable after completion/skip (ONBD-7). A confused day-3 user has literally no in-product way to re-learn the flow; the project even maintains a resources-sync skill to keep this guide fresh for an audience that can't see it.
- **Evidence:** 16898: `rb.classList.toggle("hidden", !isAdmin())`; 16929: 'Owner-only: the tab is hidden unless isAdmin()'; pfpResources button nested in the admin-only #pfpAdminSection (5519–5534); Help group at 5541–5554 lists only learn + feedback + legal.
- **Recommendation:** Expose the Resources guide to all users (Help → "How Anchor works"), after a copy pass to strip owner-only content; add a "Replay the tour" entry that reopens the wizard read-only (steps 1–2) without touching completion flags.
- **Principle:** NN/g: help and documentation should be searchable and task-focused; empty-state job #2 (teach) extended to the whole first-run — free onboarding is wasted if gated
- **Breakage risk:** The guide's current copy may reference admin-only features — requires a resources-sync audit before ungating; renderResources lazy-load path (16932+) is already user-safe.

### ONBD-12 — Two stacked amber banners with different CTAs compete at the top of the calculator
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** demoBanner 5827–5833 + setupNudge 5836–5843 (adjacent siblings at the top of #appBody); renderDemoBanner 23873–23877; renderSetupNudge 23893–23911
- **Problem:** A fresh user who opens the calculator sees both bars at once: same amber family, same tone, stacked — one says "You're using sample rates… Open Settings", the other "Finish setup to unlock… Set up profile →". Two look-alike warnings with two different destinations (raw Settings vs the guided flow) force the user to diff them before acting, and the weaker path (dumping a novice into the full Settings tab wall via openAdmin, 24448) is the one attached to the more important message. Each also has its own dismiss with different persistence (session JS var vs localStorage), so they reappear on different schedules.
- **Evidence:** Markup adjacency 5827/5836; independent visibility logic 23876 vs 23896–23900; demoBannerSettings → openAdmin (24448) vs setupNudgeCta → startSetupFlow (24455); dismiss persistence: `demoBannerDismissed` module var (23756) vs NUDGE_DISMISS_KEY localStorage (23882).
- **Recommendation:** Collapse into ONE prioritized banner with a single CTA: state 1 (!onboarded) → "Add your company info" → onboarding; state 2 (onboarded, unverified rates) → "N rates still on sample numbers" → the guided verify view (wizard step 3 or the Unverified jump list), not raw Settings. One dismiss model (localStorage, cleared on completion).
- **Principle:** principles.md overwhelm cause #2: no single obvious primary action — everything competes; Hick's Law
- **Breakage risk:** Both banners have tracking events and Resources-guide descriptions (resources-sync); merged banner needs [data-theme=light] overrides; keep the honest per-session reappearance semantics of the rates warning or ONBD-1's safety erodes further.

### ONBD-13 — All banner/nudge controls are far below the 44px touch floor — field users on phones will misfire
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** nudge CSS 2743–2768 (.nudge-cta, .nudge-dismiss); demoBanner buttons 5831–5832
- **Problem:** The setup-nudge CTA is an ~26px-tall pill (padding 4px 12px, font 11px, 2746–2748); its dismiss is an 18px × with padding 0 4px (2759–2766). The demo banner's "Open Settings" is an 11px underlined text link and its dismiss a bare text-sm × with no padding (5831–5832). These are the first interactive elements a mobile contractor meets, they sit adjacent to each other, and every one of them is under half the 44px minimum — mis-taps here either dismiss the app's most important warning or dump the user into Settings unintentionally.
- **Evidence:** CSS: `.nudge-cta { padding: 4px 12px; font-size: 11px; }` (2746–2749), `.nudge-dismiss { font-size: 18px; padding: 0 4px; }` (2759–2766); markup: demoBannerSettings `text-[11px] ... underline` (5831), demoBannerDismiss `ml-3 ... text-sm leading-none` (5832). Contrast with setupSkip which correctly carries min-h-[44px] (5129).
- **Recommendation:** Give every banner control a ≥44px hit area (padding or ::after expansion), and separate the dismiss × from the CTA by at least 8px of dead space. Applies to whichever merged banner ships from ONBD-12.
- **Principle:** Apple HIG / WCAG 2.5.5-adjacent 44px touch-target floor (skill a11y baseline); mobile ergonomics for glove-handed field use
- **Breakage risk:** Taller banners eat vertical space above the calculator on small screens — check the sticky header + jobSummaryBar stack still leaves content room; light-mode contrast of enlarged controls (theme-parity).

### ONBD-14 — Onboarding fields yell on the first keystroke instead of on blur
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** onboarding input handler 24558–24563; renderOnboardingStatus required-chip logic 23628–23641
- **Problem:** The delegated input listener marks a field touched on its FIRST keystroke (24559–24561), and touched required fields immediately render "✗ Company name is required"-style chips while invalid (23637–23640). So typing "A" of "Anchor Installs" instantly paints a red ✗ error that flickers away at the second character; same for email/phone/website, which stay red for most of the typing. This is the classic premature-validation antipattern — hostile mid-answer error flashing on the very form meant to feel welcoming.
- **Evidence:** 24558–24563: `onboardScreen.addEventListener("input", e => { if (...OB_VALIDATORS[e.target.id]) { obTouched[e.target.id] = true; } renderOnboardingStatus(); });` — touched is set on input, not blur; blur handler (24565–24573) also sets it, redundantly.
- **Recommendation:** Reward early, punish late: set obTouched only in the blur handler; keep the input handler solely to (a) live-clear a chip already in error and (b) update the progress counter/submit label. The green ✓ can still appear live once valid.
- **Principle:** states-and-feedback §5: validate on blur for new input, on input only once already errored — never flash errors mid-answer
- **Breakage risk:** The "N required fields complete" counter and submit label are driven by the same render — keep them updating on input while gating only the ✗ chips on touched, or the counter will feel laggy.

### ONBD-15 — Disabled onboarding submit uses native disabled — invisible to keyboard/screen-reader users
`severity: polish` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** obSubmit 5034 + renderOnboardingStatus 23690–23700
- **Problem:** While required fields are incomplete, `btn.disabled = true` (23694) makes the submit button unfocusable and unannounced, so a screen-reader user tabbing the form never discovers the (excellent) blocker label "Complete 2 more required fields". The label does the right teaching job — sighted users get it, AT users don't.
- **Evidence:** 23693–23695: `btn.disabled = true; btn.textContent = \`Complete ${missingRequired} more required field...\``; markup 5034 relies on :disabled styling.
- **Recommendation:** Switch to aria-disabled="true" + a suppressed click handler (keep the visual disabled styling), so the button stays in the focus order and its blocker text is readable; on click while blocked, focus the first invalid field.
- **Principle:** states-and-feedback §6: blocked-but-needed actions should use aria-disabled, keep the control discoverable, and name the blocker
- **Breakage risk:** Must suppress the click handler manually or a double-tap could submit an invalid form; re-style since :disabled UA styles no longer apply.

## Section: dashboard

**Summary:** The dashboard is a well-architected launchpad (cards → one drilled-in section at a time) with genuinely useful working surfaces — shopping lists, calibration, follow-ups — but it is tuned for the established user, not the first login. A zero-job account lands on a "Welcome back" greeting and nine 240px feature cards full of empty-state filler (two of which falsely congratulate the new user), so the first-priced-job journey depends entirely on the two gold CTAs in the header/hero — one of which ("New quote") silently wipes the working draft via resetAll() with no confirmation. Card count (9) exceeds the 5–7 chunk budget and two cards are mislabeled aliases whose destinations don't show what the card promises (Revenue trend → Materials donut; Deal pipeline → flat jobs grid). The E-signatures panel — the highest-trust surface — renders network failure as "No quotes sent yet," and the Job Details modal mixes three commit models with placeholder-only labels and silent edit loss on backdrop tap. Numeric craft is strong (tabular figures, two-channel deltas, labeled baselines, reduced-motion support), so most fixes are flow and state-handling work, not visual rework.

**Strengths (do not regress):**
- KPI tiles follow the doctrine recipe exactly: label → big tabular-nums number (CSS 3164, data-countup 12401) → month-over-month delta carried in two channels (arrow SVG + color, 12388–12398) with a labeled baseline ("vs last mo"), and deltas are honestly suppressed when there is no prior-month data (dashStatTrends returns {} at 12364). Later phases must not regress the tabular-nums/delta pattern.
- The drill-in launchpad is real progressive disclosure: home shows glanceable mini-charts per card (dashCardBody 11024–11129), applyDashView (11171–11197) shows exactly one focused section with a back control, and monitoring (cards/KPIs) is kept separate from authoring (calibration editors, e-sign sender) per the monitoring-vs-authoring rule.
- Destructive-action grading on the e-sign panel is exemplary: voiding is scoped to un-signed rows (12273–12280) and deleting a signed agreement requires a typed DELETE with the consequence named (12299–12311), while unsigned records get a lighter confirm. CSV export even guards formula injection (14016–14022). Keep this ladder intact.
- Motion and input ergonomics fundamentals are respected: every dashboard animation checks prefers-reduced-motion (dashReduceMotion 11642 used by count-ups/donut/bars/trend), the chart-type picker is a real radiogroup with arrow-key/Home/End support (12617–12623, 13629–13640), and the jobs search input uses text-base on mobile to prevent iOS focus-zoom (5320).

### DASH-1 — Zero-job first login shows nine empty feature cards, two with false 'all done' messages, and no single first-quote path
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** Dashboard home for a new account — dashGreeting 10876, DASH_CARDS 10898–10950, empty bodies 11029/11039/11051/11057/11076/11083/11094/11109/11120, dashStats hidden 12385
- **Problem:** Signed-in users land here first. With zero jobs the KPI strip hides, and the user gets 'Welcome back' (they have never been here) plus 9 equal-weight cards of filler: Follow-ups says 'You're all caught up. 🎉' and Shopping says 'Nothing to buy — all materials checked off.' — false completion states for someone who has done nothing — while E-signatures shows big '0 / 0' stat boxes. Nothing in the content area drives the one action that matters: price the first job (the only CTAs are the header pill and hero button).
- **Evidence:** 10876 greet always 'Welcome back'; 11051 `return dlbEmpty("You're all caught up. 🎉")` fires whenever computeFollowups is empty (including 0 jobs); 11057 `dlbEmpty("Nothing to buy — all materials checked off.")` fires when dashShoppingJobs(jobs) is empty; 11083 renders `0 Approved / 0 Signed` stat tiles for esign; 12385 hides #dashStats when `!p.real.length`; renderDashLaunchpad 11136 always renders all 9 cards.
- **Recommendation:** Add a first-run branch when dashLaunchContext(jobs).jobCount === 0: swap the hero to 'Price your first job' with one primary button, render a single onboarding card (set your rates → quote → save, linking to the setup wizard and calculator) plus at most 2–3 relevant cards, and gate the 'caught up / all checked off' copy on jobCount > 0. Change greeting to 'Welcome' on first run.
- **Principle:** Empty states must teach and point to one action (states-and-feedback); Hick's Law / 5–7 chunk budget (ux-pitfalls §1); rank widgets by decision value (data-display §10)
- **Breakage risk:** New markup needs [data-theme="light"] overrides (theme-parity) and a resources-sync pass; renderDashLaunchpad is also re-run on every renderDashboard, so the first-run branch must key off live job count to disappear after the first save.

### DASH-2 — 'New quote' silently destroys the working draft; two look-alike gold CTAs have hidden different semantics
`severity: high` · `kind: flaw` · `effort: S` · `verdict: ADJUSTED`

- **Where:** Dashboard nav 'Open Calculator →' 5236 and hero 'New quote' 5255–5258; handlers 13688–13689; resetAll 14732–14776
- **Problem:** The dashboard shows two gold CTAs at once. 'Open Calculator' just closes the dashboard (state preserved); 'New quote' calls resetAll(), which replaces STATE with blanks and saveState()s it — no confirmation, no undo, only a 'Reset' toast. A contractor with a half-built unsaved quote who taps 'New quote' (reasonably reading it as 'go make a quote') loses the draft, and the wiped draft cloud-syncs over the good one (last-edit-wins, one draft per account).
- **Evidence:** 13689 `on("dashNewQuote", () => { try { resetAll(); } catch (_) {} closeDashboard(); })`; 14732–14769 resetAll rebuilds STATE from defaults and calls saveState(STATE) with no guard; 13688 dashOpenCalc only closeDashboard(). hasQuoteInput exists at 14779 but is not consulted.
- **Recommendation:** Before resetting, check the current draft has content (hasQuoteInput or dirty fields): if so, confirm with a specific dialog ('Start a new quote? Your unsaved draft for <name> will be cleared') or auto-preserve (offer 'Save draft as job' / Undo toast that restores the pre-reset STATE snapshot). Consider one CTA on the dashboard, with 'New quote' as a secondary inside the calculator.
- **Principle:** Prevent > Undo > Confirm (ux-pitfalls §9); recognition of consequence before destructive action; smart defaults
- **Breakage risk:** Users who rely on 'New quote' always giving a clean slate gain one dialog; must respect the draft cloud-sync invariants in reconcileDrafts (memory: draft is one-per-account, last-edit-wins) so an Undo restore doesn't resurrect a stale draft on another device.
- **Verifier adjustment:** The two-look-alike-CTA + unguarded reset core is real: 13688 dashOpenCalc→closeDashboard() only; 13689 dashNewQuote→resetAll()+closeDashboard(); resetAll (14732–76) rebuilds STATE, saveState()s it, toast('Reset'), no confirm/undo; hasQuoteInput (14779) is not consulted by the handler. BUT the draft-loss/cloud-clobber claims are wrong: (1) resetAll never writes the draft job — the autosaved 'Working draft' entry in the jobs list survives and stays loadable via Jobs → 'Load →'; (2) the post-reset render() schedules writeDraftJob, which bails at 15402 (`if (!r || !hasQuoteInput(r)) return;`) on blank input AND cancels the pending pre-reset timer, so no blank draft is written; (3) cloud push (scheduleDraftCloudPush) only fires from inside writeDraftJob after that guard, and saveState (8364) is localStorage-only — the wiped state never syncs over the cloud draft. Real loss is limited to live rail edits <600ms old and non-quotable input (e.g. customer fields typed with no footage). Severity should drop to medium: destructive-without-confirmation stands, catastrophic sync-clobber does not.

### DASH-3 — E-signatures panel renders network failure as 'No quotes sent yet' and has no loading state
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderDashEsign 12074–12232; error swallow 12092–12095; empty copy 12202–12204
- **Problem:** Tapping the E-signatures card fires an async Supabase query with nothing rendered in the interim (blank panel), and any error — offline in the field, RLS/session hiccup — is caught and coerced to rows = [], which then renders the true-empty copy 'No quotes sent yet.' A contractor checking whether a customer signed a binding agreement can be told, wrongly, that no quotes were ever sent. That is a direct trust failure on the highest-stakes surface of the dashboard.
- **Evidence:** 12083–12095: `try { ...await sb.from("shared_quotes")... } catch (e) { rows = []; }` with comment 'Quiet failure'; 12202–12204 `rows.length ? ... : 'No quotes sent yet.'`; no skeleton/spinner is written to #dashEsign before the await (drill-in shows whatever was previously in the div — empty on first open).
- **Recommendation:** Write a skeleton list (2–3 shimmer rows) into #dashEsign before the query; on catch, render a distinct error state — 'Couldn't load your e-signatures. Check your connection.' + Retry button — and never reuse the empty-state copy for failures.
- **Principle:** Missing loading/error states; skeletons over blank waits, 0.1s/1s feedback limits (ux-pitfalls §8); error state ≠ empty state (states-and-feedback)
- **Breakage risk:** Skeleton/error markup needs light-mode overrides; keep the one-time _esignWired click delegation (12208–12231) intact so the Retry button can reuse it.

### DASH-4 — Launchpad alias cards land somewhere that doesn't show what the card promised (Revenue trend → Materials donut; Deal pipeline → flat jobs grid)
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** DASH_CARDS 10927–10932 (revenue goto:"insights", pipeline goto:"jobs"); dashGoTo 11200–11214; _dashInsightTab default 11631; jobs view 5302–5325
- **Problem:** The 'Revenue trend' card previews a monthly revenue/profit sparkline, but tapping it runs dashGoTo("insights") which opens the Insights section on whatever _dashInsightTab holds — 'materials' by default — so the user sees a materials cost donut titled 'Insights'. 'Deal pipeline' promises 'every saved quote by stage… and your win rate' but goto:"jobs" opens the flat saved-jobs grid (search/sort/cards) with no stage chart or win rate; the stage view actually lives in Insights → Jobs tab (dashPipelinePanel). In both cases the section title also changes ('Insights'/'Jobs'), compounding the disorientation.
- **Evidence:** 10927 `{ key: "revenue", ... goto: "insights" }`, 10930 `{ key: "pipeline", ... goto: "jobs" }`; 11200–11214 dashGoTo(view) never sets _dashInsightTab or _dashChartType; 11631 `let _dashInsightTab = "materials"`; the data-dashview="jobs" panel (5302–5325) contains only sort/search/grid — win rate/stage bars are in renderDashJobsPanel 12408 (a different panel).
- **Recommendation:** Give goto a payload: revenue → { view:"insights", tab:"jobs" or "customers", chart:"trend" } setting _dashInsightTab/_dashChartType before applyDashView; pipeline → insights Jobs tab (pie) rather than the grid. Or simpler: delete both alias cards and surface their sparkline/stackbar inside the Jobs and Insights card bodies (see DASH-5).
- **Principle:** Consistency & user control — a control's label must match its destination (NN/g match between system and real world); one answer per widget (data-display §10)
- **Breakage risk:** dashGoTo also drives the entrance animation for the insight panel (11213); presetting tab/chart must still trigger dashPlayPanel once, not twice, and the chart-type radiogroup state must stay in sync with _dashChartType.

### DASH-5 — Nine launchpad cards exceed the 5–7 chunk budget; Follow-ups (the money-on-the-table card) is 7th, ~1,500px deep on mobile
`severity: medium` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** DASH_CARDS 10898–10950; grid 5266 (grid-cols-1 on mobile); card height 240px CSS 3111
- **Problem:** The launchpad is a decision menu, and it presents 9 choices with conceptual overlap (Jobs vs Deal pipeline; Insights vs Revenue trend — two of the nine are literal aliases per DASH-4, and Manufacturers opens the Settings modal rather than a drill-in, a third interaction model). On a phone that's ~2,200px of single-column 240px cards before the footer; the only urgency-bearing card (Follow-ups, 'N need attention') sits 7th, well below the fold, so stale quotes go unseen on the surface built to catch them.
- **Evidence:** 10898–10950 lists 9 entries; 5266 `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; 3111 `.dash-launch-card { ... height: 240px; }`; 13430–13433 Manufacturers card short-circuits to openAdmin()/showSettingsTab — no drill-in; followups is DASH_CARDS[6].
- **Recommendation:** Merge the two alias cards into their parents (Jobs card gains the stage stackbar; Insights card cycles or shows the revenue sparkline), landing at 7 cards. Additionally, when ctx.followupCount > 0, either float Follow-ups to position 2 or add a gold count badge to its card head so urgency is visible from the top of the page.
- **Principle:** Hick's Law / working-memory chunk budget ~5–7 (ux-pitfalls §1); rank by decision value, not data availability (data-display §10)
- **Breakage risk:** PR #38 deliberately set the current order (Jobs/Shopping/Calibration first) — confirm with the owner before reordering; dynamic ordering can break spatial muscle memory, so a badge may be safer than reflow. Resources guide describes the card list.

### DASH-6 — Job Details modal silently discards unsaved edits on backdrop tap and mixes three commit models
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Job Details modal — backdrop close 13693–13694, closeJobDetails 13735–13738, Save button 13970–13971, instant-commit status select 13968–13969, instant photo save 13978–13981
- **Problem:** Text fields (job name, customer, phone, email, address, notes) only persist via 'Save changes', but the status dropdown and photo upload commit instantly, and clicking the backdrop or × closes without any dirty check. On mobile, tapping outside the modal is an easy accident — everything typed vanishes with zero feedback. Three different commit models on one surface means the user cannot form a reliable model of what is saved.
- **Evidence:** 13693–13694 `jdBackdrop.addEventListener("click", closeJobDetails)`; 13735–13738 closeJobDetails only nulls _jdJobId and dismisses; no comparison of field values to job; contrast 13973 where 'Open in calculator' does call saveJobDetailsEdits(job.id, true) first — the silent-save plumbing already exists.
- **Recommendation:** Reuse saveJobDetailsEdits(id, true) on every close path (backdrop, ×, Escape) — autosave-on-close makes the whole modal one commit model and lets you drop the 'Save changes' button; alternatively keep explicit save but track dirty state and confirm before discarding.
- **Principle:** Never lose user input silently; consistent commit model (forms-and-inputs; ux-pitfalls §7 accidental dismissal)
- **Breakage risk:** Autosave removes 'click away to cancel' as an escape hatch — users who deliberately abandon edits would need an explicit Revert; also autosaving triggers pushJobToCloud on every close (13754), slightly more sync traffic.

### DASH-7 — Job & customer fields are placeholder-as-label with no visible labels, and phone/email get the wrong mobile keyboard
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderJobDetails inputs 13892–13897 (jdJobName/jdName/jdCompany/jdPhone/jdEmail/jdAddress), notes 13902
- **Problem:** All six fields rely solely on placeholders ('Job name (e.g. Smith Residence)', 'Customer…', 'Phone'…). Once a job has data the placeholders are gone: 'Smith Residence' vs 'John Smith' rows are indistinguishable, and correcting a value means deleting it to re-read what the field was. Phone and email are bare <input> (no type/inputmode/autocomplete beyond company), so field-crew phones get the full text keyboard for numbers, and screen readers get placeholder-only naming.
- **Evidence:** 13892–13897: every input is `<input id="jd…" class="control …" placeholder="…" value="…">` with no <label>, no aria-label, no type="tel"/"email"/inputmode; only jdCompany has autocomplete (13894).
- **Recommendation:** Add persistent small labels above each field (the jd-section pattern already provides the container), plus type="tel" + autocomplete="tel" on phone, type="email" + autocomplete="email" on email, autocomplete="name"/"street-address" where apt. Placeholders demote to format examples.
- **Principle:** Labels above the field, always visible; right keyboard per field (ux-pitfalls §4, Baymard/NN-g)
- **Breakage risk:** Modal gets ~120px taller — verify it still scrolls cleanly on small phones; label styles need light-mode overrides (theme-parity).

### DASH-8 — Sub-44px delete buttons sit 6px from primary actions, guarded only by generic native confirm()
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** Job card footer 12754–12761 (.dash-card-del CSS 3108: 30×30px, gap-1.5 from 'Load →' 3106); nudge dismiss 3243 (.nudge-x 32×32) beside 'Open job'/'Calibrate →' 11525–11526/11537–11538; confirms 13550 and 13975
- **Problem:** On every job card the permanent-delete trash icon is a 30×30px target 6px from the 'Load →' button — a classic fat-finger pairing on a touch grid (fingertip contact ~1cm). The only guard is a generic confirm('Delete this job? This can't be undone.') that names nothing about the job; routine generic confirms habituate and get reflex-approved, and there is no undo. Follow-up dismiss ×s are similarly 32px and adjacent to their action buttons.
- **Evidence:** 3108 `.dash-card-del { width: 30px; height: 30px; }`; 12756 `gap-1.5` between load and delete; 13550 `confirm("Delete this job? This can't be undone.")`; 3243 `.nudge-x { width: 32px; height: 32px; }`; no soft-delete/undo path exists in deleteJob usage here.
- **Recommendation:** Expand hit areas to ≥44px with a ::after pseudo-target; move card-level delete into the Job Details modal / an overflow menu (one target per row); replace the generic confirm with delete → 'Job deleted — Undo' snackbar (hold the job in memory ~6s before committing), and if a confirm stays, name the job and its price.
- **Principle:** ≥44×44pt touch targets + separation of destructive actions; prevent > undo > confirm (ux-pitfalls §3, §9); one target per row on dense touch grids (data-display §8)
- **Breakage risk:** Undo requires deferring deleteJob's cloud/storage side-effects (job rows sync to Supabase) — an instant hard delete undone locally could resurrect on another device; keep the e-sign typed-DELETE ladder untouched.

### DASH-9 — Trend-chart axis labels render at ~5px on phones (9px text inside a 600-unit viewBox scaled to ~340px)
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** dashTrendSVG 12668–12707 — grid labels 12683, x-labels 12686–12687, svg 12700; used by all three insight tabs (12471, 12570, 11966)
- **Problem:** The trend chart draws value and month labels at font-size:9px inside viewBox 0 0 600 220 with width:100%. In the insights card on a 360–390px phone the SVG scales to ~0.55×, so those labels paint at roughly 5px — unreadable, failing the minimum legible type floor for content the user must read (the y-axis dollar values are the whole point of the chart). preserveAspectRatio="none" (12700) additionally distorts glyphs if the box is ever height-constrained.
- **Evidence:** 12683 `style="font-size:9px;opacity:0.6;"` on axis value text; 12687 same for x labels; 12700 `<svg viewBox="0 0 600 220" style="width:100%;height:auto;" preserveAspectRatio="none">`; container is the insights card padded to the phone width (11942 dash-cust-chart etc.).
- **Recommendation:** Move axis labels out of the scaled SVG into HTML (absolutely positioned flex rows), or compute the viewBox width from the container at render time so 1 SVG unit ≈ 1 CSS px and 9–10px labels render true; drop preserveAspectRatio="none". Cap x-labels to ~4 on narrow widths.
- **Principle:** Minimum legible type at density; numeric contrast/legibility floors (data-display §7; spacing-type-color §3)
- **Breakage risk:** dashAnimateTrend targets .dash-trend-line/.dash-trend-dot (11744–11759) — keep class names; label opacity 0.6 over currentColor must be re-checked in light mode.

### DASH-10 — Jobs drill-in counts and lists the working draft while the launchpad card excludes it — numbers disagree
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderDashJobs 12767–12781 (no isDraft filter, count 12774–12775) vs dashLaunchContext 10954 / dashRecentJobs 11010–11013 (filter !j.isDraft)
- **Problem:** The Jobs launchpad card and every KPI exclude drafts ('2 jobs'), but drilling into Jobs shows '3 jobs' including a 'Working draft' card with different affordances (no status select, 12724–12725). The same surface disagreeing with its own preview by one erodes trust in every other number on a numbers-first product; the status filter path silently drops the draft again (12772), so the count flips as you filter.
- **Evidence:** 12771 `let list = (jobs || loadJobs()).slice().reverse()` — drafts included; 12772 only filters drafts when _dashStatusFilter set; 12774–12775 count uses unfiltered list; 10954 `filter(j => j && !j.isDraft)` for the card preview.
- **Recommendation:** Count only non-draft jobs in #dashJobsCount and render the draft (if any) pinned first under a separate 'Working draft' header, or label the count '2 jobs + 1 draft'. Keep the draft visible — it's a legitimate re-entry point.
- **Principle:** Consistency of the same metric across views; trust in numbers (data-display §7 preamble — a cost tool lives on 'can I trust this number?')
- **Breakage risk:** Users may currently reopen their draft from this grid — don't hide it, only fix the count; sort modes (12787–12812) must handle the pinned draft.

### DASH-11 — Job-card photo actions: hover-only on desktop (keyboard-invisible), 10px/~24px-tall always-on buttons over every thumbnail on touch
`severity: medium` · `kind: improvement` · `effort: S` · `verdict: ADJUSTED`

- **Where:** dashJobCard overlay 12732–12738; CSS 3078–3105 (.dash-thumb-actions hover reveal 3084; touch variant 3102–3104: font-size 10px, padding 6px 9px)
- **Problem:** On desktop 'Upload photo' and '✨ Generate with Grok' only appear on :hover (no :focus-within), so keyboard users can never reach them. On touch they are always visible on every card — two adjacent ~24px-tall, 10px-text buttons crowding every thumbnail's bottom edge — under half the 44px floor, and 'Generate with Grok' plausibly spends AI credits from a target that small. It also duplicates functionality that already exists inside Job Details (jdPhoto/jdGenThumb 13887–13888).
- **Evidence:** 3084 `.dash-thumb:hover .dash-thumb-actions { opacity: 1; }` with no focus-within rule; 3104 `.dash-thumb-act { width: auto; font-size: 10px; padding: 6px 9px; }` under `@media (hover: none)`; 12737 the Grok button per card.
- **Recommendation:** Collapse to a single ≥44px camera affordance per thumbnail (tap → small sheet with Upload / Generate), add `.dash-thumb:focus-within .dash-thumb-actions { opacity:1 }` + make the thumb focusable, or drop card-level photo actions entirely and rely on Job Details. If Grok generation costs credits, say so in the sheet.
- **Principle:** ≥44px touch targets (ux-pitfalls §3); hover-revealed actions must have keyboard/focus parity (accessibility); progressive disclosure for secondary actions
- **Breakage risk:** The touch bottom-bar styling was recently hand-tuned to avoid blurring baked thumbnails (comment 3096–3101) — preserve the no-backdrop-blur constraint; theme-parity for any new sheet.
- **Verifier adjustment:** Mechanics confirmed: overlay revealed only by .dash-thumb:hover (3084) with no :focus-within rule anywhere for it (repo-wide grep: the only dash focus-within rule is 3184 for the ⓘ tooltip); touch variant is always-visible with font-size:10px, padding 6px 9px ≈ 24px tall (3102–04); both buttons render on every card (12732–38) incl. the credit-spending Grok button (12737); duplicates jdPhoto/jdGenThumb in Job Details (13887–88). Correction to the desktop claim: keyboard users CAN reach the buttons — opacity:0 + pointer-events:none does not remove them from the tab order or block keyboard activation — so the actual failure is invisible focus (you Tab onto 'Generate with Grok' with no visual indication and can trigger it blind), not unreachability. Arguably worse, but a different mechanism than reported.

### DASH-12 — Primary header controls are below the 44px touch floor on mobile (Calculator pill ~34px, avatar 36px, back button 42px)
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Nav 5236 (dashOpenCalc py-2 text-[12.5px] on mobile), 5237 (dashPfpBtn w-9 h-9), back control CSS 3194 (min-height 42px)
- **Problem:** The single most important control on the screen — the gold 'Calculator →' pill — renders about 34px tall on phones; the account avatar is 36×36 and the drill-in back button 42px. All sit in the top bar, already the hardest thumb zone; sub-floor targets there compound the reach problem for one-handed field use.
- **Evidence:** 5236 `text-[12.5px] … px-3 … py-2` (≈35px computed height at mobile breakpoint); 5237 `w-9 h-9` = 36px; 3194 `.dash-back { … min-height: 42px; }`.
- **Recommendation:** Bump mobile paddings to reach ≥44px (py-2.5/min-h-[44px] on the pill, w-11 h-11 or a padded pseudo hit-area on the avatar, min-height 44px on .dash-back). The 64px header row has the room.
- **Principle:** ≥44×44pt touch targets, larger for the primary action (ux-pitfalls §3, quick-reference)
- **Breakage risk:** Header is shared chrome — check it doesn't wrap at 320px with the FL Lookup/theme buttons at sm:; light mode borders already defined.

### DASH-13 — Dashboard charts have no text alternative for assistive tech
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Donut SVGs 11895 (customers), 12488 (jobs), 12598 (materials); trend SVG 12700; launchpad minis are aria-hidden (11021, 11104) which is fine
- **Problem:** The three insight donuts and the trend chart are bare <svg> elements — no role="img", no aria-label, no title. Screen-reader users get an unlabeled graphic or a soup of stray <text> nodes. Donuts are partially rescued by the adjacent HTML legends; the trend chart's only values live inside the scaled SVG.
- **Evidence:** 11895 `<svg viewBox="0 0 240 240" style=…>` with no ARIA attributes; 12700 trend `<svg viewBox="0 0 600 220"…>` likewise; legends at 11886–11893 are plain divs (good, readable).
- **Recommendation:** Add role="img" + a generated aria-label summarizing the answer ('Revenue by customer: Smith 42%, Jones 31%, Others 27%') to each chart SVG, or aria-hidden the SVG and add a visually-hidden summary next to the legend. Trend: include first→last delta in the label (it's already computed at 12689–12692).
- **Principle:** Sparklines/charts must keep the numeric value accessible (data-display §9); WCAG 1.1.1 non-text content
- **Breakage risk:** None visual; keep .donut-seg/.donut-center hooks used by the entrance animations.

### DASH-14 — KPI strip spends its fourth slot on 'Avg markup' while the day's actionable count (follow-ups) has no glance presence at the top
`severity: polish` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderDashStats tiles 12390–12395; followupCount only surfaces in card #7 (10936–10939)
- **Problem:** Open pipeline / Won / Win rate answer real owner questions, but 'Avg markup' across all saved jobs is closer to a vanity aggregate (it barely moves and drives no daily decision), while the number a contractor should act on today — 'N quotes going quiet' — is buried in the 7th card (see DASH-5). The glance strip is the one place guaranteed above the fold on mobile.
- **Evidence:** 12394 `{ key: "markup", label: "Avg markup", … sub: "N saved jobs" }`; computeFollowups (11485–11504) already produces the count cheaply; dashStats renders before the launchpad (5262 above 5266).
- **Recommendation:** Swap the fourth tile for 'Needs attention: N' (gold when N>0, tap → dashGoTo("followups")), or keep markup on desktop (lg:grid-cols-4) and substitute on mobile. Keep the count-up/tabular treatment.
- **Principle:** Rank widgets by decision value, not data availability; demote vanity metrics (data-display §10)
- **Breakage risk:** The four tiles are described in the in-app Resources guide (run resources-sync); making a tile tappable needs a real <button> + focus style to stay a11y-clean.

## Section: calculator-core

**Summary:** The money screen is structurally strong: one hero input (window LF) gets a price, everything else is pre-set Florida-typical defaults tucked into a one-open-at-a-time accordion with honest collapsed recaps, and a genuinely well-built sticky live total sits in the thumb zone above the input drawer — the doctrine's highest-leverage calculator pattern, correctly layered (drawer z-30 under bar z-35, safe-area padded, reduced-motion aware). But the first-job journey has three trust cracks: the suggested first tap (sample chips) produces a price that silently omits all per-opening setup labor and never surfaces the warning; the new Like Floors mode redefines what the LF input means without relabeling it, so a building can quote at N× or 1/N of reality; and a sliding/bifold-only job never shows a price at all because the results gate ignores two of the three door engines. Accessibility is the other systemic weakness — pinch-zoom is disabled globally while most inputs sit below 16px, the only field-education surface (info-tips) is a 13px tap target, and the segmented controls are keyboard-dead fake tabs. Most fixes are small and surgical; the two-way risk is that label/nudge/copy changes must be mirrored in light mode and the in-app Resources guide.

**Strengths (do not regress):**
- Sticky live total done nearly to spec (CSS 424–454, render 10133–10144): fixed bottom bar in the thumb zone, updates on every input, overlays the open drawer (z-35 vs rail z-30) with 88px clearance (450–452) so the price reacts live WHILE editing — plus safe-area insets, prefers-reduced-motion handling, and an SR-labeled <output>. Later phases must not bury or conditionalize this bar.
- Progressive disclosure architecture: rail-tidy accordion (one section open, 10575–10603) with collapsed one-line recaps rendered from STATE (renderRailAccSummaries 10536–10562, 'Set linear footage' cue), high-rise gating that hides AND engine-gates multi-floor fields while preserving entered values (updateHighRiseVisibility 9956–9971), and swing stage force-off below 4 stories so hidden controls can never leak into the price (9975–9984).
- Guided-not-gatekept pricing education: impact-graded info-tips on every field (High/Med/Low with concrete numbers, e.g. labor min/LF at 5628), the '≈ X LF / window' sanity hint (10382–10387), crew-hour-derived suggestion chips for lift days/stage days/storage months that apply on tap (10407–10422, 14610–14619), and 'Unverified ✎' badges that jump straight to the rate in Settings (10199–10201).
- Focus-safe live editing: delegated input handlers update STATE and re-render without rebuilding list DOM so typing never loses focus (extra floors 14624–14649 with the explicit comment, sliding doors 20500–20516), and a document-level wheel guard blurs number inputs so scroll can't silently change values (14485–14489).

### CALC-1 — Sliding/bifold-door-only jobs never show a price — results and sticky total stay hidden
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** render() results gating, index.html 10124–10134 (vs. computeSlidingDoors 8999–9043, computeBifoldDoors 9064)
- **Problem:** The 'do we have a quote' gate counts only window LF and SWING doors: `hasLf || hasDoors` where hasDoors reads r.swingDoors.total. A job made of only sliding glass doors or bifolds (both first-class priced categories with panel labor, flashing, anchors, inspection trip) leaves #results hidden, the mobile #mtotalBar hidden, and the 'Get an instant price' empty state on screen — while the engine has a real dollar figure.
- **Evidence:** Line 10125: `const hasLf = (parseFloat(STATE.totalLF) || 0) > 0;` Line 10126: `const hasDoors = !!(r.swingDoors && r.swingDoors.total > 0 && r.swingDoors.enabled);` Line 10127: `const hasInput = hasLf || hasDoors;` — r.slidingDoors / r.bifoldDoors (returned at 9579) are never consulted. computeSlidingDoors line 9023 prices panelTotal × 4 hrs and 9035 materialsExtraCost even with zero window LF.
- **Recommendation:** Extend the gate: `const hasInput = hasLf || hasDoors || (r.slidingDoors?.count > 0) || (r.bifoldDoors?.count > 0);`. Spot-check the results header with lf=0 (per-LF badge already guards with `lf > 0 ? … : 0`).
- **Principle:** Nielsen 'Visibility of system status'; mobile-patterns.md §7 — the price must be visible and update live for any valid input
- **Breakage risk:** Per-LF badge will read $0.00/LF on doors-only jobs (already guarded against divide-by-zero); saved-job snapshots for doors-only jobs start flowing — verify Save Job modal and PDFs handle lf=0. Run resources-sync if the guide describes when a price appears.

### CALC-2 — Like Floors silently redefines 'Total window width' as a per-floor takeoff without relabeling the input
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** LF field label index.html 5669–5670; getFloorGroups 9117–9123; only cues at 10487 ('× N floors' chip) and 10174–10178 ('/floor' table sub-label)
- **Problem:** With High-rise + Like Floors on, STATE.totalLF becomes the TYPICAL FLOOR's footage and the engine multiplies it by stories (primary.count = n). But the input keeps its permanent label 'Total window width (linear feet) — Add up the width of every window opening, in feet.' A contractor who already entered the building total and then toggles Like Floors quotes N× the real job; one who enters per-floor with the toggle off quotes 1/N. The unit of the single most important input changes meaning based on a toggle two fields up.
- **Evidence:** 5669: `<label for="totalLF">Total window width <span…>(linear feet)</span></label>`; 5670 hint 'Add up the width of every window opening'; 9119–9120: `primary = { …count: n, totalLF: STATE.totalLF … }` with n = floorMult() = storyNum(stories) when likeFloors (8571–8573). No code path rewrites the label or hint when likeFloors flips.
- **Recommendation:** When highRise && likeFloors, swap the label to 'Window width — per typical floor' and render a computed echo line under the input: '× 17 floors = 4,080 LF building total' (mirror it in #lfPerWindowHint styling). Same treatment for 'Windows count'. One function called from updateHighRiseVisibility()/updateLikeFloorsToggleUI().
- **Principle:** forms-and-inputs.md §5 (label must state the unit/meaning); mobile-patterns.md §7 'guided, not gatekept' — trust dies on surprise totals
- **Breakage risk:** AI plan-fill markers key off these fields (markFieldAi 'totalLF') — keep ids stable; label text appears in the Resources guide (run resources-sync) and needs a [data-theme=light] pass for the new echo line (theme-parity).

### CALC-3 — Sample-job chips produce systematically underpriced demos (no window count → zero setup labor) and the warning nudge is buried
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Empty-state chips 6121–6132 + wiring 24653–24683; setup-labor math 8731–8732; nudge logic 10393–10395; nudge placement 5785–5787
- **Problem:** The first thing a new user is told to tap ('Tap a sample job below to fill it in instantly') sets LF/construction/house/impact/stories but never windowCount — so openingCount=0 and estimateLaborBreakdown drops per-opening setup entirely (45 min × ~15 openings ≈ 11 crew-hrs ≈ $660+ missing on the 240 LF sample). The chips also don't clear a stale pre-existing windowCount. The only warning ('↑ Enter window count for accurate setup labor & materials') renders at the very bottom of the rail — inside a CLOSED drawer on mobile — below the Extras accordion, pointing 'up' at nothing related.
- **Evidence:** 6122: `data-lf="240" data-construction… data-lift="false"` — no data-wc attribute; 24662–24670 copies only those five fields into STATE; 8731: `const openingCount = wc + dc + sgdc + bfc;` → setupHrs = 0 when wc=0; 10394: `const showNudge = lf_ > 0 && wc_ === 0;` toggles #remodelNudge which lives at 5785 after the Extras accordion, before Save.
- **Recommendation:** Give each chip a realistic data-wc (e.g. 240 LF → 16 windows) and clear windowCount when applying a chip; move the count nudge inline directly under #windowCountInput inside the Openings accordion, and mirror it as a small amber line under #sellingPrice so it's visible where the price is read. Add role="status" so it's announced.
- **Principle:** NN/g error prevention + mobile-patterns.md §6 smart defaults ('validate, not type'); trust-through-transparency (§7)
- **Breakage risk:** Sample prices change everywhere the chips are screenshotted/described — run resources-sync; nudge relocation needs theme-parity check; ensure the inline nudge doesn't shift focus while typing.

### CALC-4 — Pinch-zoom is disabled app-wide while most calculator inputs are below 16px
`severity: high` · `kind: flaw` · `effort: M` · `verdict: ADJUSTED`

- **Where:** Viewport meta line 5; .margin-pill input 228–234 (inherits 14px from 212); .sgd-cell input 1097 (13px); .ef-in micro-inputs 10046–10054
- **Problem:** `user-scalable=no` blocks pinch-zoom for every low-vision user on the money screen — a WCAG 2.2 SC 1.4.4 failure the design doctrine explicitly forbids. It's presumably there to suppress iOS auto-zoom on focus, which only exists because the numeric field fonts (14px margin-pill, 13px sgd-cell, small ef-in fields) are under the 16px threshold. Field-crew users in sunlight with gloves are exactly the population that zooms.
- **Evidence:** Line 5: `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no" />`; line 212 `.margin-pill { …font-size: 14px; }` with input `font: inherit` (230); line 1097 `.sgd-cell input { …font-size: 13px… }`. Only the LF hero input (20px, line 794) is safe.
- **Recommendation:** Remove `user-scalable=no`; raise all focusable numeric inputs to ≥16px (1rem) — widen the 34–76px pill inputs accordingly. Doctrine: 'the ≥16px input rule is the only accessible fix.'
- **Principle:** forms-and-inputs.md §8 + WCAG 2.2 SC 1.4.4 Resize Text
- **Breakage risk:** 16px fonts in 34–48px-wide pill inputs will clip 3-digit values — widths need retuning across rail, extra-floor rows and door rows; double-check no layout overflow in the 92vw mobile drawer; theme-parity pass on any restyled pills.
- **Verifier adjustment:** All code evidence checks out: line 5 has user-scalable=no; .margin-pill is 14px (212) with input font:inherit (230); .sgd-cell input 13px (1097); .ef-in inputs (10046–10054) sit inside .margin-pill labels so they inherit 14px; only the hero LF input is 20px (794). Correction: 'blocks pinch-zoom for every low-vision user' is overstated — iOS Safari (browser mode) has ignored user-scalable=no for pinch-zoom since iOS 10. It DOES block zoom on Android Chrome (absent the accessibility override) and in iOS home-screen/standalone mode, which this app explicitly targets (apple-mobile-web-app-capable=yes, line 7). Still a real WCAG 1.4.4/1.4.10 exposure; scope the affected population accordingly.

### CALC-5 — Empty-state recap logic is dead code: desktop never shows the 'Add your window footage' CTA, and the mobile spec bar goes stale when inputs are cleared
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** jobSummaryTiers 10480–10499; renderLiveRecap 10502–10515; renderJobSpecSummary call order 10136 vs 10140 vs 10426
- **Problem:** The is-empty branch requires BOTH tiers empty, but size always contains '1-story' (stories ≥1 from buildState 8474) and spec is always populated from job defaults (10494–10498). So a fresh desktop user sees '1-story · New · Block · Impact · Viwinco · Nail-fin' in the recap band instead of the designed call-to-action. Separately, renderJobSpecSummary runs AFTER the `if (!hasInput) return` (10140), so on mobile, typing 240 LF then deleting it leaves the sticky bar reading '240 LF · 1-story …' while the price bar disappears — a stale spec on screen.
- **Evidence:** 10490: `if (STATE.stories) { … size.push(`${m[1]}-story`) }` — always truthy; 10506: `if (!size.length && !spec.length)` — unreachable; 10136 renderLiveRecap() before early-return at 10140, renderJobSpecSummary() only at 10426 after it.
- **Recommendation:** Drive the empty CTA off hasInput (or lf/wc/doors all zero) instead of tier emptiness, and call renderJobSpecSummary() alongside renderLiveRecap() before the early return so both surfaces reset.
- **Principle:** NN/g visibility of system status; ux empty-state guidance (mobile-patterns.md §6 — the screen should never show stale or default-noise state)
- **Breakage risk:** None significant — verify the mobile bar still flips to the gold 'Set up your job →' styling (is-empty class) in both themes.

### CALC-6 — Sub-44px touch targets on the primary mobile surface: info-tips, row-remove buttons, suggestion chips, Edit pill
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: ADJUSTED`

- **Where:** info-tip 1712–1718 (13×13 svg, tap-wired 24613–24620); .ef-remove 1103 (26×26); .sgd-remove 1088 (22×22); .sug-chip 1106 (~22px tall); #jobSummaryEdit 374–386 (~29px); #jobRailToggle 5589 (p-1)
- **Problem:** The '?' info-tips are the ONLY way to learn what Application/Glass/High-rise etc. do to the bid, yet they're 13px icons with no padded hit area — nearly untappable with a work-gloved thumb. Remove buttons on door/floor rows (22–26px) sit next to selects, inviting accidental row deletion misses, and the tap-to-apply suggestion chips (Suggest: 3d) are ~22px tall.
- **Evidence:** 1712–1717 `.info-tip { …display:inline-flex… }` with 13×13 viewBox svg (5603 et al.) and no min-width/height; 1103 `.ef-remove { width:26px; height:26px; }`; 1088 `.sgd-remove { width:22px; height:22px; }`; 1106 `.sug-chip { …padding:3px 9px… }`.
- **Recommendation:** Give each a 44×44 hit area without visual growth: `min-width/min-height:44px; display:inline-grid; place-items:center;` (doctrine's exact recipe) or a ::after expansion; row-remove buttons also gain ≥8px separation from adjacent controls.
- **Principle:** mobile-patterns.md §2 — 44×44 iOS / 48dp Material floor; 'blame the small target, not the finger' (NN/g)
- **Breakage risk:** Bigger hit areas can overlap neighbors in the dense ef/sgd rows — keep visual size constant and test the 92vw drawer at 320px width; no theme impact if only hit areas change.
- **Verifier adjustment:** Partially wrong on the lead item: a `@media (pointer: coarse)` rule at 1232–1238 gives .info-tip::before a 40×34px hit area (and .edit-rate-btn 40×40) — so info-tips are NOT 'nearly untappable with no padded hit area' on touch; they're modestly sub-44 (40×34). Confirmed sub-target with no such compensation: .ef-remove 26×26 (1103), .sgd-remove 22×22 (1088), .sug-chip ~20–22px tall (1106: 10px font + 3px 9px padding), #jobSummaryEdit ~29px (374–386: 11px font + 6px 11px padding), #jobRailToggle p-1 + 18px svg ≈ 26px (5589). Also mitigating the Edit pill: the adjacent #jobSummaryLine (5575–5577) is a full-width button with the same aria-label/action.

### CALC-7 — Segmented controls are fake tabs with no keyboard model; Manufacturer dropdown listbox has no keyboard support
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: ADJUSTED`

- **Where:** createSegmented 9677–9703; seg containers 5630/5633/5688/5691 (role="tablist"); createDropdown 9705–9748
- **Problem:** Construction/House/Glass/Application use role=tab + aria-selected but are selection controls, not navigation; there's no roving tabindex and no arrow-key handling, so a keyboard user tabs through every option of every group (12+ stops in one accordion), and a screen reader announces misleading 'tab' semantics. The Manufacturer dropdown (aria-haspopup=listbox) opens only on click, its options carry role=option on <button>s with no aria-selected and no arrow/Escape/typeahead handling in the component itself.
- **Evidence:** 9683: `<button class="seg-btn…" role="tab" aria-selected=…>` generated with no keydown listener anywhere in createSegmented (9693–9699 wires click only); 9711–9716 dropdown items with `role="option"`, no aria-selected attribute, no keydown wiring (9733–9743 click only).
- **Recommendation:** Adopt the doctrine's segmented-control contract: role=radiogroup wrapping role=radio, single tab stop, ArrowLeft/Right moves + selects. For the dropdown, add aria-selected, ArrowUp/Down navigation and Home/End; Escape already closes globally (24720).
- **Principle:** mobile-patterns.md §5 a11y contract for segmented controls; WAI-ARIA APG radiogroup/listbox patterns
- **Breakage risk:** SEGMENTS.setValue API is called from job-load and chip-prefill paths (24673–24676) — keep the data-value contract identical; verify focus styles exist for the new roving tabindex in both themes.
- **Verifier adjustment:** Core confirmed: createSegmented (9677–9703) emits role=tab/aria-selected buttons in role=tablist containers (5630/5633/5688/5691) with click-only wiring (9694–9698) and no roving tabindex — misleading tab semantics, every option a tab stop. createDropdown (9705–9748) options are role=option <button>s with no aria-selected (only a .selected class, 9720), no arrow keys, no typeahead. Corrections: (1) Escape DOES close the dropdown — a document-level keydown handler at 14431–14436 calls closeAllDropdowns(); (2) 'opens only on click' is misleading — the trigger and options are native <button>s, so Enter/Space activate them and Tab reaches every option; the dropdown is operable, just without the listbox keyboard model; (3) '12+ stops in one accordion' overcounts — the seg groups total ~10 option-buttons split across two accordions (Construction 3 + House 2 in Site & build; Application 3 + Glass 2 in Openings).

### CALC-8 — Markup is displayed everywhere but adjustable nowhere near the price
`severity: medium` · `kind: improvement` · `effort: L` · `verdict: CONFIRMED`

- **Where:** mtotal bar '@ 35% markup' 5816–5818; results '· @ 35% markup' 5863–5865 / 10120; margin source 9575 (DATA.config.defaultMargin, Settings-only input 6710–6711)
- **Problem:** Every quote broadcasts 'Selling price @ N% markup', but changing N requires leaving the job for Settings → Rates, and the change silently re-prices EVERY job (it's a global). Flexing margin per job — sharpening a bid to win it, padding a nightmare access job — is a core quoting decision, and right now the calculator offers no per-job control at the moment of decision.
- **Evidence:** 9575: `const margin = DATA.config.defaultMargin ?? 35;` — calculate() reads only the global; STATE has no margin field (buildState 8468–8506); the only writer is adminMargin at 19382–19383.
- **Recommendation:** Make the markup chip on the results header (and the mtotal-sub line) tappable → a small bottom sheet with a stepper/slider that writes STATE.margin (job-scoped, persisted with the job, defaulting to the global). CTA copy stays honest: price updates live in the sticky bar.
- **Principle:** mobile-patterns.md §7 'scoped edits in bottom sheets so the running quote stays in view'; smart defaults with trivial correction (§6)
- **Breakage risk:** Touches calculate(), saved-job schema, draft autosave (10432–10464), PDFs, e-sign snapshots and the comparison view — per-job margin must round-trip or old jobs re-price. Update Resources guide (resources-sync) and both themes for the new sheet.

### CALC-9 — Recap summaries count door ENTRIES, not door quantities — summary disagrees with the priced job
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** jobSummaryTiers 10483–10484; renderRailAccSummaries 10543–10544 (vs. computeSlidingDoors 9004)
- **Problem:** The sticky bar / recap band compute doors as `slidingDoors.length + bifoldDoors.length`, but each sliding/bifold row carries a qty multiplier (one row, qty 3 = three doors priced). A job quoting three identical sliders shows '1 door' in the bar while the price, labor hours and materials reflect three — exactly the 'does this number add up?' doubt a quoting tool can't afford. One-off-floor doors are also invisible to the summary.
- **Evidence:** 10483–10484: `const doors = swingDoorCount() + ((STATE.slidingDoors || []).length) + ((STATE.bifoldDoors || []).length);` vs 9004: `const count = norm.reduce((s, d) => s + d.qty, 0);`.
- **Recommendation:** Reuse the engine's own counts: `swingDoorCount() + computeSlidingDoors().count + computeBifoldDoors().count` (both already run per render), and consider including aggregated extra-floor doors when highRise is on.
- **Principle:** Single source of truth / consistency (NN/g heuristic 4); mobile-patterns.md §7 — the persistent summary must be honest
- **Breakage risk:** computeSlidingDoors runs twice per render already (updateSlidingDoorsSummary) — negligible; no visual/theme change.

### CALC-10 — Warning nudges live detached at the rail bottom, not announced, pointing at collapsed sections
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** remodelNudge/accessNudge markup 5785–5790; toggling 10393–10403; accordion one-open behavior 10575–10603
- **Problem:** Both money-protecting warnings ('Enter window count…', '4+ stories with no lift or swing stage — add access equipment in Extras') render below all three accordions, above Save. With one-section-at-a-time accordions, the field they reference is usually collapsed; the '↑' arrow points at whatever section happens to be above. They're plain divs with no role=status, so screen-reader users never hear them. A user can Save a structurally underpriced job without ever seeing either.
- **Evidence:** 5785: `<div id="remodelNudge" class="hidden text-[11px]…">↑ Enter window count…</div>` after the extras accordion (5783 '/accordion'); no aria-live/role attributes (contrast setupNudge 5836 which has role="status" aria-live="polite"); 10394–10402 only class-toggle them.
- **Recommendation:** Move each nudge inside the accordion it concerns (under #windowCountInput; inside Extras body), add role="status", and when a nudge is active add a small dot/count on the collapsed accordion header summary so the signal survives collapse.
- **Principle:** GOV.UK error-message placement (fix-in-context, forms-and-inputs.md §5/§7); WCAG 3.3.1 error identification announced via live region
- **Breakage risk:** Accordion max-height animation (10 670: 4000px cap) must absorb the extra rows; theme-parity for the amber tint in light mode; resources-sync if guide references nudge wording.

### CALC-11 — High-rise mode is the FIRST field in the first accordion — rarest case leads the common flow
`severity: medium` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Site & build accordion order 5616–5656: High-rise (5623–5627) before Construction (5628), House (5631), Stories (5634), Manufacturer (5647)
- **Problem:** The primary persona (solo residential installer) opens 'Site & build' and the first decision offered is 'High-rise / multi-floor' with a three-line explainer telling them to leave it off. The three high-impact everyday fields (Construction, House, Stories) sit below it. Every quote pays a reading tax for a feature most users will never enable — inverted progressive disclosure introduced by this PR.
- **Evidence:** 5623–5627 place highRiseToggleBtn first in .rail-acc-body; its own copy admits the default: 'Leave off for a normal house.' Construction's tooltip (5628) is tagged High impact while High-rise is Medium.
- **Recommendation:** Move the High-rise toggle to the end of Site & build (or into Extras, since its dependents — swing stage, storage, trim — already live there). Keep field order = impact order: Construction, House, Stories, Manufacturer, High-rise.
- **Principle:** mobile-patterns.md §6 progressive disclosure — 'default the common case; tuck edge cases behind disclosure'; 20% of fields drive 80% of jobs
- **Breakage risk:** Like Floors toggle is anchored under Stories (5640) and extraFloorsField follows it — keep that dependency cluster together when moving; no engine change; theme untouched.

### CALC-12 — One-off floor editor: placeholder-as-label name field and a title-attribute-only explanation on 'Floors like this'
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderExtraFloors 10035–10059 (label input 10042, count pill 10048, 34px door inputs 10052–10054)
- **Problem:** The floor-name input has no label at all — only placeholder 'Lobby / Penthouse', which vanishes on typing and is invisible to screen readers as a name. The critical multiplier 'Floors like this' explains its double-penthouse semantics only via title="…", which never appears on touch devices. The Sliders/Bifolds '× panels' micro-inputs (34px wide) rely on 9–10px uppercase spans as labels.
- **Evidence:** 10042: `<input class="ef-in num-input" data-f="label" placeholder="Lobby / Penthouse" …/>` with no <label>/aria-label; 10048: `title="How many identical copies of this floor…"` as the only explanation; 10052–10054 inputs at width:34px.
- **Recommendation:** Add aria-label="Floor name" plus a visible micro-label matching the pill pattern; replace the title with the existing .info-tip pattern (tap-friendly after CALC-6); consider one-line summary under each row ('2× Penthouse · 60 LF · 4 win').
- **Principle:** forms-and-inputs.md §5 — visible label above the field, never placeholder-only (Baymard)
- **Breakage risk:** renderExtraFloors rebuilds innerHTML on add/remove only — new markup must keep data-f/data-idx contract for the delegated handler (14624–14649); theme-parity on new labels.

### CALC-13 — 'Placeholder rate for now; tune later' shipped in user-facing Swing stage copy although the rate IS editable in Settings
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Swing stage helper text 5751; Settings inputs adminSwingStageRate/Setup/MinStories 6788–6809
- **Problem:** The rail tells users the swing-stage price is a 'Placeholder rate for now; tune later' — developer-changelog language that (a) is factually stale, since $/day, setup fee and min-stories are all editable in Settings → Rates, and (b) tells a customer-facing estimator that part of his bid is made-up. Interior trim's helper correctly points to Settings; this one contradicts it.
- **Evidence:** 5751: 'Suspended scaffold for high-rise work — only shows above 3 stories. Placeholder rate for now; tune later.' vs 6788–6794 live inputs `adminSwingStageRate` (placeholder 850) and `adminSwingStageSetup` (1200).
- **Recommendation:** Rewrite: 'Suspended scaffold for 4+ story work. Daily rate & setup fee are tunable in Settings → Rates.' Consider an Unverified badge (pattern exists at 10199–10201) instead of prose if the defaults are still estimates.
- **Principle:** UX writing: never expose internal state doubt on a financial surface (trust-through-transparency, mobile-patterns.md §7)
- **Breakage risk:** Pure copy — run resources-sync so the Resources guide matches the new wording.

### CALC-14 — Numeric inputs never normalize on blur — display can disagree with priced STATE
`severity: low` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** storiesInput handler 14456–14464; liftDaysInput 14537–14544; projectedMonths 14590–14597; engine clamps 9250, 9546, 9563
- **Problem:** Handlers clamp STATE (`Math.max(1, parseInt(v) || 1)`) but never write the clamped value back, and there are no blur formatters. Typing '0' (or clearing) in Stories leaves '0' visible while the job prices as 1 story; '0' in Lift days shows 0 while the quote charges 1 day. The field the user sees and the number in the price silently disagree until a reload.
- **Evidence:** 14458: `STATE.stories = Math.max(1, parseInt(e.target.value, 10) || 1);` with no `e.target.value` write-back; 9250: `const days = Math.max(1, parseInt(STATE.liftDays) || 1)` while 14538–14539 stores the raw string.
- **Recommendation:** Add blur handlers that snap the field to the clamped/parsed STATE value ('reward early, punish late' — don't fight keystrokes, normalize on exit). One shared helper for all margin-pill numerics.
- **Principle:** forms-and-inputs.md §6 validation timing + §2 'format on blur'
- **Breakage risk:** Blur write-backs must not fire render loops or steal focus during rapid tabbing; verify AI-fill markers aren't cleared by programmatic value writes.

### CALC-15 — Sticky total bar navigates away instead of expanding, and its live region announces every keystroke
`severity: polish` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** mtotalBtn handler 24625–24629; output aria-live 5819; doctrine ★ pattern mobile-patterns.md §7
- **Problem:** Tapping the sticky total closes the input drawer and scrolls to #results — the user loses their editing position and must reopen the drawer via the FAB to continue. The doctrine's collapsed-bar pattern expands in place into the line-item breakdown precisely so the edit context survives. Separately, #mtotalOut is aria-live=polite + aria-atomic, so typing '2','24','240' dictates three full 'Selling price $…' announcements to screen-reader users mid-keystroke (and an <output> nested inside a <button> is dubious semantics).
- **Evidence:** 24626–24628: `closeJobRail(); … res.scrollIntoView({behavior:"smooth"…})`; 5814–5819: `<button id="mtotalBtn"…><output id="mtotalOut" … aria-live="polite" aria-atomic="true">`.
- **Recommendation:** Make the bar expand a medium-detent bottom sheet with the top 5 cost lines + 'View full breakdown' (drawer stays open beneath); debounce the live region (update the announced text ~800ms after last input) and move aria-live off the button's child onto a sibling visually-hidden status node.
- **Principle:** mobile-patterns.md §7 ★ sticky live total ('expands on tap into the full breakdown; collapsed-by-default wins'); §4 sheet guidance
- **Breakage risk:** New sheet component needs focus/Escape handling, light-mode overrides (theme-parity) and must not stack with the drawer backdrop (never-stack-overlays rule); keep scroll-to-results as the fallback when the drawer is closed.

## Section: floors-highrise — PR #39 \"Repeating floors + high-rise costs\" (high-rise master toggle at index.html:5623–5627, Stories input 5636–5640, Other-floors editor 5641–5646 + renderExtraFloors 10031–10061, Extras fields 5749–5780, engine 8559–8658 / 9116–9180 / 9479–9573, bindings 14515–14680, load/save 9155–9168 / 15502–15550, PDFs 15848 / 16626–16645, admin knobs 6775+ / 19401+)

**Summary:** PR #39 is engineered with real care for the first-job journey: every new capability defaults off, the engine is gated so a single-floor ranch quote is byte-identical to main, and the ranch user's only exposure is one new toggle — but that toggle is the FIRST field in Site & build, its copy tells normal-house users to ignore it, and it secretly holds hostage two everyday features (interior trim, material storage) that have nothing to do with high-rises. For the tower user the mental model (typical floor × Like Floors + one-off floors) is priceable and the math is admirably transparent in the Labor Detail card, but it is taught nowhere at the point of entry: turning on Like Floors silently flips the meaning of the primary LF input two accordions away (the single most dangerous trust flaw here — an N× quote error), the reveal scatters fields into a different collapsed accordion, and two different concepts share the phrase \"like floors.\" The customer-facing quote gets only a compressed Building one-liner (which drops doors-only floors it is charging for) while the per-floor schedule stays on the internal PDF. Craft debt is typical WIP: sub-44px remove/suggest targets, an invisible unlabeled floor-name input, placeholder-rate copy leaking to users, and hover-only help on a touch-first surface. The bones — aggregation model, price-parity discipline, suggestion chips, focus-preserving inline editor — are strong; what's missing is the layer that makes the model legible and trustworthy at the moment of input.

**Strengths (do not regress):**
- Default-off with price parity: all floors/high-rise state defaults off (buildState 8491–8501) and the engine gates every new cost on those flags (9486, 9545, 9562; floorMult 8571), so a simple single-floor quote is explicitly byte-identical to pre-PR pricing (comment 9172–9174) — the first-job journey sees zero added complexity. Later phases must not let any of these gates leak.
- Transparent, single-source labor math: applyLaborRealism (8635–8645) adds named, quantified breakdown rows ("Repeat-floor efficiency ×0.87", "High-rise height premium ×1.45") and buildingLaborBreakdown (8652–8658) is shared by the quote row, the Labor Detail card, and the PDF labor line so they cannot drift — exactly the show-your-work pattern a pricing tool needs.
- Suggestion chips are smart defaults done right (10404–10422, 14610–14620): lift/stage days and storage months derived from the job's own crew-hours, shown only when they differ from what's entered, applied in one tap, never auto-overwriting the user's number.
- Careful state hygiene: renderExtraFloors rebuilds only on add/remove/load so typing keeps focus (10028–10031); applyJobToState never infers likeFloors and restores the per-floor takeoff only when the multiplier will run (15515–15547), fixing the documented $29k→$49k reload re-multiplication; floorPersistFields is threaded through all four save paths including writeDraftJob (14498+/15448+), and light-mode overrides shipped with the new CSS (3031–3033, 3711).

### FLR-1 — "Like Floors" silently flips the meaning of the primary LF input — an N× price error waiting to happen
`severity: critical` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Site & build: likeFloorsToggleBtn (index.html:5640) vs Openings: #totalLF label (index.html:5668–5670); engine floorMult (8571–8573) and calculate() aggregation (9171–9180)
- **Problem:** Turning on "Like Floors — multiply every floor" changes what the hero "Total window width (linear feet)" field means: it stops being the job total and becomes the PER-TYPICAL-FLOOR takeoff, multiplied by Stories. The LF field's label and helper ("Add up the width of every window opening, in feet") never change, and the toggle lives in a different accordion (Site & build) than the field it redefines (Openings). A contractor who already entered the whole building's footage and then flips the toggle gets a quote N× too high; one who enters per-floor footage with the toggle off quotes N× too low. The only cues are a "× 12 floors" chip in the recap (10486–10488) and tiny "≈ x /floor" hints in breakdown rows (10174–10177) — nothing at the point of entry.
- **Evidence:** index.html:5668–5670 — label reads `Total window width (linear feet)` / "Add up the width of every window opening, in feet." unchanged in this PR; 8571–8573 `floorMult() { return (STATE.highRise && STATE.likeFloors) ? storyNum(STATE.stories) : 1; }`; 9175 `const _agg = aggregateTakeoff(getFloorGroups())` multiplies STATE.totalLF by that count; 5640 toggle text `Like Floors — multiply every floor` sits in the Site & build accordion, two sections away.
- **Recommendation:** When likeFloors is on, dynamically retitle the LF field ("Typical floor — window width (per floor)") and its helper, and render a computed echo directly beneath it: "× 12 floors = 3,600 LF building total". Do the same for Window count. Mirror the per-floor framing in the sticky recap ("300 LF/floor × 12"). This is the smart-defaults/visibility-of-system-status move: the input's meaning must be legible at the input, not two accordions away.
- **Principle:** NN/g visibility of system status + match between system and mental model; mobile-patterns.md §7 (trust: no surprise totals — every number's derivation visible)
- **Breakage risk:** Label text is referenced by the in-app Resources guide (run resources-sync); dynamic label swap must not break the ai-filled highlight or light-mode label colors (theme-parity).

### FLR-2 — Interior trim and material storage are gated behind "High-rise mode" though neither is high-rise-specific
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** High-rise toggle copy (index.html:5624–5626), trim gate in calculate() (9486), storage gate (9562), trim/storage rail fields hidden by updateHighRiseVisibility (9956–9972, 5761–5780)
- **Problem:** Interior trim (header/jambs/sill on every opening) is a bread-and-butter single-family line item, and on-site material storage fits any long job — but both only exist inside "High-rise mode", whose own helper says "Leave off for a normal house." A remodeler pricing trim on a ranch must first enable a mode explicitly labeled as not for them (a contradiction they'll never resolve — they just won't find trim). The mode conflates two unrelated ideas: a floor-repetition model and a grab-bag of extras.
- **Evidence:** index.html:9486 `const trimLF = !STATE.highRise ? 0 : (STATE.trimEnabled ? …)` — trim prices only with highRise on; 9562 `const monthly = STATE.highRise ? (parseFloat(STATE.storageMonthlyCost) || 0) : 0;`; 5625 helper: "Turning this on adds Like Floors, one-off floors, swing stage, material storage & interior trim. Leave off for a normal house."; 9967–9970 hides #storageRailField/#trimRailField whenever highRise is off.
- **Recommendation:** Ungate trim and storage from highRise: show them as ordinary Extras (default off, so pricing is unchanged), keep only Like Floors, Other floors, swing stage and the height premium behind the mode, and rename it "Multi-floor building" to match what it actually gates. Progressive disclosure should hide the *rare* thing, not hold common features hostage to an unrelated mode.
- **Principle:** Progressive disclosure hides edge cases, not shared features (mobile-patterns.md §6); conceptual-model integrity (match between system and real world)
- **Breakage risk:** Legacy-job highRise inference (15521–15527) keys off trimEnabled/storageMonthlyCost — ungating changes what that inference must preserve; re-run the A/B price parity audit; resources-sync and theme-parity for the relocated fields.

### FLR-3 — Stories segmented control replaced by a bare unbounded number input — ergonomics regression for the 95% case, misleading for towers without Like Floors
`severity: high` · `kind: flaw` · `effort: M` · `verdict: ADJUSTED`

- **Where:** Stories field (index.html:5634–5639), binding (14515–14528 in bindControls), getStoriesMultiplier (8592–8598), stale info-tip (5634)
- **Problem:** Every user — including the ranch/2-story majority — lost the one-tap segmented Stories control and now gets a 48px-wide type-in number field (spinners suppressed via -moz-appearance:textfield and .num-input), so the common case requires summoning the keyboard. Worse, the field accepts any number for everyone, but with high-rise mode off (or Like Floors off) the labor multiplier is capped at the 3-story value (8595 `if (n >= 3) return 1.65`), so typing "8 stories" on a plain job changes nothing beyond 3 — and the info-tip still only explains "×1.3 for 2-story and ×1.65 for 3-story", never mentioning the cap, Like Floors, or the height premium.
- **Evidence:** index.html:5636–5638 `<input id="storiesInput" type="number" min="1" … style="width:48px…">` replacing the old `segStories` seg (removed per diff hunk @@ -13911); 8592–8598 caps the multiplier at n>=3; 5634 tooltip text unchanged from the 3-option era.
- **Recommendation:** Restore a segmented 1 / 2 / 3 / "4+" control; picking "4+" reveals the numeric input (progressive disclosure of the tower case). Update the info-tip to state the ≤3 cap and that stories only multiply the takeoff when Like Floors is on. Segmented controls are the documented mode-switch pattern with ≥44px targets; typing is for unbounded values only.
- **Principle:** mobile-patterns.md §5 mode-switching via segmented controls, §6 smart defaults (validate, don't type); components.md §3 accessible segmented control
- **Breakage risk:** Deep-link/init sync now writes #storiesInput directly (init(), ~24671); setup-wizard stories leaf and SEG_LABELS.stories must be re-wired; storyNum() already tolerates both formats so saved data is safe. Resources-sync for the tooltip copy.
- **Verifier adjustment:** Substance confirmed: segStories seg removed and replaced by 48px storiesInput (5636–5638; verified in git diff vs origin/main — a dead SEG_LABELS.stories entry survives at 14445); spinners suppressed (.num-input CSS 118–120 + inline -moz-appearance); multiplier capped at 1.65 for n>=3 when not highRise+likeFloors (8592–8598); tooltip at 5634 still teaches only ×1.3/×1.65. Corrections: the binding is at 14453–14465, not 14515–14528 (input handler clamps to >=1, no max); and 'typing 8 stories changes nothing beyond 3' is true for pricing but the accessNudge (10401) does start appearing above 3 stories even on plain jobs.

### FLR-4 — One toggle in Site & build silently materializes fields inside a different collapsed accordion (Extras) — and floor takeoffs are split across sections
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** highRiseToggleBtn in Site & build (index.html:5623–5627); revealed fields swingStage/storage/trim live in the Extras accordion (5749–5780); one-off floor takeoff editor in Site & build (5641–5646) while the typical floor's takeoff is in Openings (5668+)
- **Problem:** The toggle's helper promises it "adds Like Floors, one-off floors, swing stage, material storage & interior trim", but three of those five appear inside the *Extras* accordion, which is collapsed and possibly off-screen — nothing navigates the user there, so the reveal is invisible (the only hint is the accessNudge, which fires solely for 4+-story jobs missing access equipment, 10399–10402). The information architecture also splits floor takeoffs: the lobby/penthouse LF-and-windows editor sits under "Site & build" while the typical floor's LF and windows live under "Openings" — the same kind of data in two different mental buckets.
- **Evidence:** index.html:9956–9972 `updateHighRiseVisibility()` toggles #extraFloorsField (Site & build) and #storageRailField/#trimRailField (Extras, 5761/5776) in one shot; 5625 lists all five reveals with no location cue; the Other-floors editor (5641–5646) collects totalLF/windowCount/doors — Openings-type data — inside Site & build.
- **Recommendation:** Consolidate: give high-rise jobs a single "Building" cluster (Like Floors, Other floors, swing stage, storage, trim together), or at minimum append a one-line pointer under the toggle when enabled ("Swing stage, storage & trim unlocked in Extras ↓") and flash the Extras accordion summary. Chunk by mental model — all floor takeoffs in one place.
- **Principle:** Grouping/chunking by mental model, 5–7 clusters (mobile-patterns.md §6); NN/g visibility of system status (invisible state changes are undiscoverable)
- **Breakage risk:** renderRailAccSummaries and updateJobExtrasSummary reference fields by section; moving DOM nodes requires re-checking updateHighRiseVisibility's id list, accordion recaps, and light-mode overrides.

### FLR-5 — One-off floor name field is an invisible, unlabeled input — placeholder is its only affordance
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: ADJUSTED`

- **Where:** renderExtraFloors row template (index.html:10042); no .ef-in CSS exists (only .ef-row/.ef-remove added at 1102–1104)
- **Problem:** The floor label input `<input class="ef-in num-input" data-f="label" placeholder="Lobby / Penthouse" …>` has no visible label, no aria-label, and — unlike every sibling wrapped in a .margin-pill — no wrapper or own styling. With Tailwind preflight resetting borders/backgrounds, it renders as borderless transparent text: users can't tell it's editable, and once they type, the "what is this field?" cue (the placeholder) is gone. Screen readers announce an unnamed textbox.
- **Evidence:** index.html:10042 — bare input outside any pill; grep confirms no `.ef-in` style rule anywhere in the stylesheet (only .ef-row border and .ef-remove at 1102–1104); every other input in the row is wrapped in `.margin-pill` (10046–10048) which supplies border/background/focus ring.
- **Recommendation:** Wrap it in a .margin-pill with a "Name" lbl (matching siblings) or give .ef-in a control-style border/background/focus-visible ring, and add aria-label="Floor name". Keep the placeholder as an example, not the label.
- **Principle:** Placeholder-as-label anti-pattern (forms-and-inputs.md / NN/g); perceived affordance
- **Breakage risk:** New visible styling needs a [data-theme="light"] override or it'll be dark-on-dark/white-on-white (theme-parity).
- **Verifier adjustment:** Core defect confirmed: the label input (10042) has no visible label, no aria-label, no wrapper pill, and no CSS anywhere targets .ef-in (grep: only JS selectors at 14634–14635); .num-input CSS (118–120) only suppresses spinners; siblings all sit in styled .margin-pill wrappers. Two factual corrections: (1) Tailwind preflight removes border/padding but does NOT make the background transparent — the input keeps the UA 'field' background, which under color-scheme:dark (line 102) is a near-invisible dark strip on the card; same practical effect, different mechanism. (2) 'Screen readers announce an unnamed textbox' is overstated — per HTML-AAM the placeholder is used as fallback accessible name, so SRs typically announce 'Lobby / Penthouse'; placeholder-as-name is still an anti-pattern (name vanishes visually once typed).

### FLR-6 — New touch targets well under 44px: 26px floor-remove button and ~22px suggestion chips
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** .ef-remove CSS (index.html:1103), .sug-chip CSS (1106), instances at 10043 and 5746/5758/5773
- **Problem:** The × remove button on each one-off floor is a fixed 26×26px, and the tappable "Suggest: 12d" chips are 10px text with 3px vertical padding (~22px tall). Both are primary interactions on a rail that field contractors use on phones; at these sizes mis-taps are routine — and a mis-tap on × destroys a floor's takeoff with no undo (the click handler splices immediately, 14657–14661).
- **Evidence:** index.html:1103 `.ef-remove { width: 26px; height: 26px; … }`; 1106 `.sug-chip { font-size: 10px; … padding: 3px 9px; }`; 14657–14660 remove handler `STATE.extraFloors.splice(…); renderExtraFloors(); render();` with no confirmation/undo.
- **Recommendation:** Extend hit areas to ≥44px with padding (visible glyph can stay small: inline-grid, min-width/min-height 44px per mobile-patterns §2), and add an undo toast or a 2-tap confirm on floor removal since it deletes typed data.
- **Principle:** Touch targets 44×44 iOS / 48dp Material (mobile-patterns.md §2); error prevention for destructive actions
- **Breakage risk:** Larger hit areas change row spacing in the narrow rail; verify wrap behavior at 320–375px widths and keep the existing light-mode chip/remove overrides (3031–3033) in sync.

### FLR-7 — WIP language shipped to users: "Placeholder rate for now; tune later" in the Swing stage helper
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Swing stage rail field helper (index.html:5751)
- **Problem:** The user-facing helper reads "Suspended scaffold for high-rise work — only shows above 3 stories. Placeholder rate for now; tune later." A quoting tool telling a contractor mid-bid that the rate behind a $850/day + $1,200 setup line is a placeholder undermines trust in the whole number; "only shows above 3 stories" also narrates UI mechanics instead of guidance. Similar placeholder framing exists in the trim helper's tone.
- **Evidence:** index.html:5751 exact copy; DEFAULT_DATA comments mark swingStage/trim as PLACEHOLDER (7581–7589) — appropriate in code, leaked into UI copy here.
- **Recommendation:** Rewrite: "Suspended scaffold for buildings 4+ stories. Rates are set in Settings → Labor (default $850/day + $1,200 setup) — review before quoting." Keep dev status in code comments only. Consider an 'unverified rate' badge pattern if you truly want to flag untuned defaults (the rate item system already has `unverified: true`).
- **Principle:** Trust & disclosure (trust-ethics.md); UX writing — speak to the user's task, not the implementation
- **Breakage risk:** Copy change only; run resources-sync so the in-app guide matches the new wording and the stated defaults.

### FLR-8 — Customer-facing quote under-describes the building: doors-only floors vanish from the Building line, and the floor schedule is internal-only
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** buildingSummaryText filter (index.html:8580–8582); customer PDF/share get only the one-liner (15848–15850, ~15988); FLOOR SCHEDULE only in internal exportPDF (16626–16645)
- **Problem:** buildingSummaryText() filters one-off floors to those with LF>0 or windows>0 — a lobby entered as doors-only (sliders/swing doors, which the editor explicitly supports and the engine prices via aggregateTakeoff) is priced but omitted from the customer PDF's "Building" line, so the customer sees a floor count that doesn't match what they're paying for. Meanwhile the per-floor schedule (which *does* count doors, 16636–16639) only prints on the internal cost-breakdown PDF — the customer/GC quote, where scope definition prevents disputes, gets just the compressed one-liner. Also, with Like Floors off on a 12-story building the juxtaposition "Stories: 12 stories" + "Building: main floor + Lobby — 2 floors" reads as a contradiction.
- **Evidence:** index.html:8581 `.filter(f => (parseFloat(f.totalLF) || 0) > 0 || (parseInt(f.windowCount, 10) || 0) > 0)` — no door check; 16640 schedule skip rule `if (lfG <= 0 && wcG <= 0 && doors <= 0) return;` does count doors; exportCustomerPDF (15848–15850) and buildCustomerSharePayload push only `["Building", buildingSummaryText()]`.
- **Recommendation:** Align the summary filter with the schedule's skip rule (include doors-only floors), and print the floor schedule block on the customer quote PDF and the public #/q/ viewer whenever buildingSummaryText() is non-empty — a GC-facing quote should itemize scope per floor group. Reconcile Stories vs Building wording when Like Floors is off (e.g. "12-story building — priced as one takeoff + Lobby").
- **Principle:** Itemized review / no surprise totals (mobile-patterns.md §7, Baymard); consistency between what's priced and what's disclosed (trust-ethics.md)
- **Breakage risk:** Customer PDF vertical layout (y-cursor pagination) must absorb the extra rows; share-payload schema changes affect the public quote viewer — test #/q/ rendering and e-sign snapshot.

### FLR-9 — Naming collision: "Like Floors" (master multiplier) vs "Floors like this" (per-row copy count) are different concepts sharing one phrase
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** likeFloorsToggleBtn (index.html:5640), Other-floors helper referencing "Floors like this" (5643), per-row count pill (10048)
- **Problem:** The master toggle "Like Floors — multiply every floor" multiplies the typical floor by Stories; the per-row "Floors like this" input is a copy count for one one-off floor. The Other-floors helper even instructs 'Set "Floors like this" to 2' — a user scanning the rail can reasonably conclude that means the Like Floors toggle. Two adjacent controls using near-identical novel jargon for different multipliers is a learnability tax on an already abstract model (base floor × repeats + one-offs).
- **Evidence:** index.html:5640 `Like Floors — multiply every floor`; 5643 helper: 'Two identical penthouses? Set “Floors like this” to 2 instead of adding the floor twice.'; 10048 pill `<span class="lbl">Floors like this</span>` (commit 696e3e5 renamed it from "How many" to this).
- **Recommendation:** Reserve one phrase for one concept. Rename the master toggle to "Repeat typical floor × stories" (states the math) and keep "Floors like this" on the row — or rename the row count to "Copies". Update the 5643 helper to match whichever survives.
- **Principle:** Consistency & standards (NN/g #4); one term = one concept (UX writing)
- **Breakage risk:** Copy-only, but the phrase appears in helpers and possibly the Resources guide — run resources-sync; no engine identifiers change.

### FLR-10 — Dropping Stories below the swing-stage threshold silently and permanently discards the swing-stage setting
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** updateSwingStageVisibility (index.html:9975–9986)
- **Problem:** If a user experiments with the Stories number (e.g. types 3 on the way to 13, or A/Bs building heights), updateSwingStageVisibility force-sets swingStageEnabled=false the moment stories < minStories — and it stays off when stories go back up. The quote silently loses a ~$3,750 line with no notice. This contradicts the feature's own stated philosophy for the high-rise toggle: "the entered values are KEPT, so toggling back on restores the job exactly" (9951–9954) — and it's redundant, because calculate() already refuses to price swing stage below the threshold (9545).
- **Evidence:** index.html:9981–9984 `if (!show && STATE.swingStageEnabled) { STATE.swingStageEnabled = false; … }`; engine gate at 9545 `if (STATE.highRise && STATE.swingStageEnabled && storyNum(STATE.stories) >= minS)` makes the forced reset unnecessary for pricing correctness; extras summary is also stories-gated (10092).
- **Recommendation:** Stop mutating the flag on visibility changes — hide the field and let the existing engine/summary gates keep it out of pricing; the setting then survives a round-trip through lower story counts, matching the high-rise toggle's keep-values contract.
- **Principle:** User control & freedom; state preservation consistency (NN/g #3/#4)
- **Breakage risk:** Verify no other code reads swingStageEnabled without the stories gate (saved-job snapshots persist the flag via floorPersistFields, 9155–9168 — loading a 3-story job with a stale true flag must still price $0, which the 9545 gate guarantees).

### FLR-11 — No live feedback per floor group — the building summary string exists but is never shown in the working UI
`severity: medium` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** buildingSummaryText (index.html:8577–8588) used only in PDFs/share payload (15848, ~15988, 16627); Other-floors editor (5641–5646, 10035–10060) has no totals echo
- **Problem:** While building a stack, the only feedback is the global price moving. There's no per-row or per-section echo ("Lobby: 60 LF · 4 win · ×1") and the excellent "17 identical floors + Lobby — 19 floors" summary the PDFs get is invisible while editing — the user first sees their building described back to them on the exported PDF. An empty added floor contributes nothing and says nothing. Confirming the mental model (base × repeats + one-offs) at edit time is exactly what makes it learnable.
- **Evidence:** grep shows buildingSummaryText referenced only at 15848 (customer PDF), ~15988 (share payload) and 16627 (internal PDF floor schedule) — no call from render()/rail code; ef rows (10040–10059) render inputs only.
- **Recommendation:** Render buildingSummaryText() live under the Other-floors field (and in the Site & build accordion recap) whenever non-empty, and show a muted per-row echo of each floor's contribution. One line of existing string — high leverage, zero new model.
- **Principle:** Visibility of system status; immediate feedback loops for calculators (mobile-patterns.md §7)
- **Breakage risk:** Rail vertical space on mobile; needs a light-mode color check (theme-parity) and a Resources mention if described.

### FLR-12 — "Floors like this" explanation is a desktop-only title attribute — invisible on the touch devices the field targets
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderExtraFloors count pill (index.html:10048); sug-chip titles (5746/5758/5773)
- **Problem:** The most confusable field in the row (see FLR-9) explains itself via `title="How many identical copies of this floor…"` — hover-only, so phone users (the stated primary context) never see it. The app already has an accessible info-tip pattern (tabindex, role=button, aria-label, tap-to-open popover — e.g. 5628/5634) used on every comparable rail field; the new feature dropped to a lesser pattern. Same for the three suggestion chips' title-only explanations.
- **Evidence:** index.html:10048 `title="How many identical copies of this floor the building has — 2 matching penthouses = 2"`; contrast with the info-tip markup at 5634; chips at 5746, 5758, 5773 use `title=` only.
- **Recommendation:** Reuse the existing .info-tip popover for the count pill, and give chips a first-use hint or an aria-label plus visible microcopy ("from crew-hours").
- **Principle:** Consistency of help patterns; hover-dependent affordances fail on touch (gestures-touch.md / NN/g)
- **Breakage risk:** Popover z-index inside the scrolling rail; light-mode popover colors already exist for info-tip.

### FLR-13 — accessNudge: sub-AA contrast, 11px type, and it sits at the rail's bottom pointing up at a collapsed section
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** accessNudge markup (index.html:5788–5790), show logic (10397–10402), light override (3711)
- **Problem:** The new "↑ 4+ stories with no lift or swing stage — add access equipment in Extras" nudge inherits the remodelNudge recipe: 11px uppercase text at rgba(201,165,88,0.55) on the near-black rail ≈ 3.2:1 contrast (below WCAG AA 4.5:1 for small text), rendered *below* the accordion stack — the user must have scrolled past Extras to see the arrow telling them to go back up into Extras, which may be collapsed. For a nudge guarding a four-figure omission (missing lift/stage on a tower), it's easy to never see.
- **Evidence:** index.html:5788 `style="color: rgba(201,165,88,0.55);"` with `text-[11px]`; placement after the accordion close at 5784; show condition 10401 requires footage entered, fires regardless of whether Extras is open.
- **Recommendation:** Raise to full-opacity gold (≥4.5:1) and 12px+, and surface it as a badge on the Extras accordion header (where the fix lives) or inline under the Stories field. Consider also flagging it in the results panel, next to the price it protects.
- **Principle:** WCAG 1.4.3 contrast; put guidance at the point of action (guided selling, mobile-patterns.md §7)
- **Breakage risk:** Light-mode override at 3711 must track any color change (theme-parity); remodelNudge shares the recipe — decide whether to fix both.

### FLR-14 — One-off floors inherit tower-wide labor factors: a ground-floor lobby gets the stories access premium, repeat-efficiency discount, and height premium
`severity: low` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** aggregateTakeoff feeds one blended LF into getLaborPerLF×getStoriesMultiplier (index.html:8688, 9134–9152); applyLaborRealism applies eff/height to ALL on-site hours (8635–8645)
- **Problem:** Because all floor groups collapse into one aggregate before labor is priced, a one-off lobby's footage is labored at the same multipliers as the tower: with Like Floors off on a 3-story job the lobby LF gets the ×1.65 access premium (8595) though it's at grade; with Like Floors on, the lobby also receives the repeat-floor efficiency discount (8643) that's justified by *identical* repeats, and the height premium. Totals are plausible but the per-floor math a savvy GC might back-compute won't reconcile, and the Labor Detail rows attribute the factors to "identical floors" that include the lobby.
- **Evidence:** index.html:8688 `return base * getStoriesMultiplier() * getImpactLaborMultiplier();` applied to aggregate lf (8734); 8640–8644 applies eff×hp to the whole on-site pool from the aggregated takeoff (8652–8657); nothing in getFloorGroups (9116–9130) carries a per-group height.
- **Recommendation:** V2: price labor per floor group (repeat efficiency only on the repeated group; access/height by each group's actual elevation — one-offs could take an optional floor number). Near-term: note the approximation in the Labor Detail card copy so the stated math matches the computed math.
- **Principle:** Unclear pricing math erodes trust (mobile-patterns.md §7 throughline; trust-ethics.md)
- **Breakage risk:** Any labor-model change shifts saved-vs-reloaded totals; the branch's A/B price-parity audit (commit 9673f6c) must be re-run, and the card/quote/PDF single-source guarantee via buildingLaborBreakdown preserved.

### FLR-15 — Stories info-tip and rail copy now lie by omission about the new model
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Stories info-tip + helper (index.html:5634–5635)
- **Problem:** The Stories tooltip still teaches only the legacy model ("×1.3 for 2-story and ×1.65 for 3-story… can trigger a lift charge") while this PR made Stories the potential per-floor multiplier (with Like Floors), added a >3 height premium, capped the access premium at 3, and made the lift available at any height (9251 change / updateLiftVisibility 9939–9947). A tower user reading the tip gets an explanation that no longer describes what the field does.
- **Evidence:** index.html:5634 tooltip body text unchanged; contrast with getHeightPremiumMultiplier (8603–8615) and floorMult (8571); lift now always shown (9939–9947).
- **Recommendation:** Rewrite the tip to cover both regimes in two sentences: "Up to 3 stories: labor climbs ~×1.3/×1.65. With Like Floors on, stories instead multiply the typical floor, plus a height premium above 3 (set in Settings)."
- **Principle:** Help & documentation must match system behavior (NN/g #10); error prevention
- **Breakage risk:** Copy only; resources-sync so the guide's stories/lift explanation matches (the branch already synced lift copy per commit 1173a3f — verify).

### FLR-16 — 9px section micro-header "Doors on this floor — optional" is below legible minimum
`severity: polish` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderExtraFloors row template (index.html:10050); "≈ x /floor" hints (10177) also 9px
- **Problem:** text-[9px] uppercase with 0.14em tracking is under the ~11px practical floor for uppercase micro-labels on mobile; combined with slate-600 on the dark card it's decorative rather than readable — and it's the only cue that the door inputs are optional. The new per-floor quantity hints in the results table (10177) reuse the same 9px size.
- **Evidence:** index.html:10050 `class="text-[9px] uppercase tracking-[0.14em] text-slate-600 font-bold"`; 10177 `text-[9px] text-slate-500`.
- **Recommendation:** Bump both to 10–11px and one step lighter tracking; the app's own established micro-label floor elsewhere is 10px (e.g. toggle-pill .lbl at 261).
- **Principle:** Legibility floors for micro-type (spacing-type-color.md); consistency with the app's own type scale
- **Breakage risk:** None beyond row-height nudges; check light-mode slate values still pass contrast at the new size.

## Section: results-outputs

**Summary:** The payoff moment itself is strong: the selling price is the dominant, glowing hero (5862), cost/profit cards and the Full Breakdown table use tabular figures with right-aligned numeric columns and sensible mobile column-hiding, and the four output artifacts are explicitly grouped "For the Customer" vs "For the Crew / Office" with plain-language descriptions — a first-time user knows exactly who each document is for. The journey stumbles right after the price appears: the document buttons sit ABOVE the Save Job button yet are gated on saving, the save gate interrupts without resuming the export, the paywall only reveals itself after the user has filled the whole save form, and the demo-branding guard is a native confirm() whose Cancel button ships a demo-branded PDF to a real customer. The share loop has a structural trust risk — the #/q/ link embeds the entire quote (including up to ~80KB of logo) in the URL, so links can break in SMS/email and the customer sees "invalid or expired," while the page footer actively warns customers to distrust the sender. The e-sign flow, by contrast, is the best-engineered trust surface in the app (frozen server-side snapshot, expiry locked to quote validity, countersigned PDF from the frozen record), marred only by a Customize UI that nudges installers to hide permit/inspection fees and redistribute their dollars into other line items.

**Strengths (do not regress):**
- Artifact audience clarity: Job Files groups outputs under "For the Customer" / "For the Crew / Office" (lines 6002, 6027) with one-line purpose descriptions per file ("safe to hand or email" 6009, "Full internal cost sheet — not for the customer" 6035) — later phases must not collapse these into a generic export menu.
- Credit/trust integrity in the save pipeline: quota is checked before building but consumed only after a confirmed write (15167–15171, 15220–15224, 15363–15367), a vanished overwrite target aborts instead of silently duplicating (15156–15161), and a failed storage write never burns a quote — the billing model never lies to the user.
- E-sign is the right trust architecture: the customer signs a frozen server-side snapshot, link expiry is locked to the quote's stated validity (16317–16319), and the countersigned PDF is rebuilt from the frozen record — "exactly what the customer saw" — not from live job numbers (16344–16351).
- Dense-numeric craft in the breakdown table: tabular-nums + right-aligned money columns (5888–5895), Rate/Case columns hidden on mobile per column-priority doctrine, per-row edit-rate pencils that get a 40px coarse-pointer hit area (1232–1233), and tappable "Unverified" badges that route demo rates to Settings (10199–10201).

### OUT-1 — Public quote share link embeds the whole quote (incl. up to ~80KB logo) in the URL — links break in SMS/email and the customer sees "invalid or expired"
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** PublicQuote IIFE: buildShareURL (index.html 3784–3789), shrinkLogo limits (3793–3800), payload build (16026–16043), error page (3922–3927)
- **Problem:** The #/q/ link is base64-encoded JSON of the entire payload. shrinkLogo passes any logo ≤80KB through UNCHANGED (SOFT_LIMIT 3798–3800), so a typical logo produces a 100KB+ URL. SMS segmentation, email line-wrapping, and messenger truncation routinely mangle URLs this long; the customer then lands on "This quote link is invalid or has expired" — trust destroyed at the exact moment they evaluate a multi-thousand-dollar price. The code already tracks url_length in analytics (16071), signaling known risk.
- **Evidence:** Line 3798–3800: `var SOFT_LIMIT = 80 * 1024; ... if (approxBytes <= SOFT_LIMIT) return resolve(dataUrl);` — an 80KB logo is embedded verbatim. Line 3788: `return origin + path + "#/q/" + token;`. Line 3922–3926 renders the dead-link error with no recovery path.
- **Recommendation:** Store view-only shared quotes server-side (the shared_quotes table and RLS plumbing already exist for e-sign — reuse it with a status like 'view') and hand out a short token URL; keep the payload-URL as an offline fallback only when the encoded URL is under ~2,000 chars (drop the logo above ~8KB in that mode). Also soften the error page with the sender's company name when decodable prefix data exists.
- **Principle:** Trust & Ethics §1 — a number that fails to arrive converts never; peak-end rule: the broken link is what the customer remembers. Also robustness of the share loop (mobile-patterns share mechanics).
- **Breakage risk:** Server-backed links require connectivity and a signed-in user (payload links work anonymous/offline today); keep the short-payload fallback. Resources guide describes the current share behavior and must be re-synced; analytics url_length semantics change.

### OUT-2 — PDF preview is functionally unreadable on phones: letter pages rasterized at 760px are shrunk to ~350px with pinch-zoom disabled app-wide
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** showPdfPreview (15656–15674), .pdf-preview-canvas CSS (1052–1058), viewport meta (line 5), preview modal (7360–7377)
- **Problem:** Pages render at a fixed 760px CSS width then `max-width:100%` shrinks them to ~345px on a 375px phone — a letter page at ~55% scale, so the 9pt body text of the customer quote renders at ~5px. The global viewport meta declares `user-scalable=no`, so pinch-zoom is blocked wherever the browser honors it (Android Chrome, iOS standalone/PWA). "View" is the primary mobile verb on every Job Files card (6016, 6042, 6064, 6085) — contractors in the field can't actually read what they're about to hand a customer.
- **Evidence:** Line 5: `<meta name="viewport" content="...user-scalable=no" />`. Lines 15660–15670: `const targetW = 760; ... canvas.style.width = (base.width * cssScale) + "px";` with line 1053 `.pdf-preview-canvas { max-width: 100%; }` — no zoom or pan affordance anywhere in the modal (7360–7377).
- **Recommendation:** Inside the preview modal, allow zoom: either remove user-scalable=no (it is also a WCAG 1.4.4 failure globally) or add explicit pinch/double-tap zoom on the pages container (CSS `touch-action: pinch-zoom` + transform-based zoom, re-rendering at higher scale on zoom-in). Minimum viable: render at container width × dpr and add a 2× tap-to-zoom toggle.
- **Principle:** Accessibility — WCAG 1.4.4 Resize Text (user-scalable=no is a named violation); mobile ergonomics: the artifact the user must verify must be legible at 360px (data-display §7 minimum legible type).
- **Breakage risk:** Removing user-scalable=no app-wide can reintroduce iOS input auto-zoom on <16px inputs — audit input font sizes or scope the change to the preview route; theme-parity pass needed if modal chrome changes.

### OUT-3 — Demo-branding guard is a native confirm() where "Cancel" ships a demo-branded PDF to a real customer
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** exportCustomerPDF (15729–15741)
- **Problem:** For un-onboarded users (the default state for every new signup, since setup is opt-in), generating the customer quote fires window.confirm with the mapping "OK = set up now · Cancel = generate with demo branding anyway." Users pattern-match Cancel to "abort this dialog/action"; here Cancel proceeds to generate a quote headed "Prime Window & Door." The one guard protecting the app's single most trust-critical artifact routes the mistaken path straight to the failure it exists to prevent — and native confirm() offers no styling, no default-safe emphasis, and reads jarringly against the app's polished modals.
- **Evidence:** Lines 15734–15740: `const proceed = confirm("Heads up — this quote still shows the demo company name...OK = set up now · Cancel = generate with demo branding anyway"); if (proceed) { startSetupFlow(); return; }` — the fall-through comment at 15740 confirms Cancel generates with demo branding.
- **Recommendation:** Replace with an in-app modal using explicit verb buttons: primary "Set up my branding" and secondary "Use demo branding this time" (both neutral, clearly labeled), matching the existing modal system. Keep the guard on share/sign paths too (see OUT-5).
- **Principle:** UX-pitfalls §9 confirmation hygiene — buttons must name outcomes, not OK/Cancel; Trust & Ethics: the quote artifact is the product's credibility.
- **Breakage risk:** None functional; new modal needs light-mode overrides (theme-parity) and the Resources guide mentions the demo-brand warning flow.

### OUT-4 — Quote-limit paywall surfaces only AFTER the user fills the entire save form
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** openSaveJobModal (15070–15098) vs. entitlement check in doSaveJob (15163–15171)
- **Problem:** openSaveJobModal performs no canGenerate() check. A user at their monthly cap fills up to 8 fields (customer, company, job name, address, phone, email, notes, recurring), taps Save Job — and only then the modal is torn down and replaced by the upsell wall. The constraint was knowable before the first keystroke. This is the exact 'disclosure delayed to the end' pattern the doctrine forbids for anything material, applied to the user's own quota.
- **Evidence:** Lines 15167–15171: `const needsQuote = !overwrite && !isAdmin(); if (needsQuote) { const chk = canGenerate(); if (!chk.allowed) { showUpsellModal(chk.reason); closeSaveJobModal(); return; } }` — the only quota check in the flow, reachable solely via the Save button. openSaveJobModal (15070–15098) references no entitlement state.
- **Recommendation:** Check canGenerate() in openSaveJobModal: if blocked, show the upsell immediately (skip the form); if this save is the last credit, show a small inline banner in the modal ("This uses your last quote until Aug 1"). Form values already persist in STATE, so no data-loss fix needed.
- **Principle:** Trust & Ethics §2 disclosure timing — surface a constraint at the moment of input, never at the end; NN/g error prevention over error recovery.
- **Breakage risk:** Overwrite saves are free (15167) — the pre-check must replicate the overwrite exemption or it will wrongly block re-saves of loaded jobs; resources-sync for quota-flow description.

### OUT-5 — Share link bypasses the saved-job gate that View/Download enforce — three buttons on one card, three different rules
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** shareCustomerQuote (16046–16049) vs. requireSavedJobForExport (15716–15723) used by exportCustomerPDF (15728) and exportPDF/exportMaterialsPDF/exportCutListPDF (16546, 16769, 21077)
- **Problem:** On the Customer Quote card, View and Download demand a saved job (toast + auto-opened save modal), but Share — the most consequential action, since it puts a price in the customer's hands — checks only hasQuoteInput and sends immediately. This defeats the documented entitlement seam ("saving is the single consumption point", 15712–15715): a user can share unlimited priced quotes without ever spending a credit. It also means a shared quote may correspond to no saved job, so when the customer calls back the installer has nothing to load. It skips the demo-branding guard (OUT-3) too — the share link happily ships "Prime Window & Door."
- **Evidence:** Lines 16046–16049: `async function shareCustomerQuote() { const r = calculate(); if (!hasQuoteInput(r)) {...} if (!window.PublicQuote) {...}` — no requireSavedJobForExport, no onboarding guard. Contrast copySigningLinkFromFiles (17637–17659) which headless-saves before creating a sign link.
- **Recommendation:** Add requireSavedJobForExport() and the demo-branding guard to shareCustomerQuote, mirroring exportCustomerPDF. Consider reusing the copySigningLinkFromFiles auto-save so the flow stays one tap after save.
- **Principle:** Consistency & standards (Nielsen #4) — identical controls on one surface must share one rule; Trust doctrine: the entitlement model must not have honest-user-only enforcement.
- **Breakage risk:** Users who today share unsaved throwaway quotes will hit a save prompt (intended, but it consumes a credit — pair with OUT-4's inline quota banner); resources-sync required (guide states share behavior).

### OUT-6 — Quote number, date, and 30-day validity regenerate on every export — the same job produces contradicting documents
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** exportCustomerPDF header (15803–15804) and terms (15943)
- **Problem:** Quote No. is `Date.now().toString().slice(-8)` — a fresh pseudo-number on every click — and the date is always today, with "valid for 30 days from the date above." Re-downloading the same saved job a week later yields a different quote number, a newer date, and a silently extended validity window. A customer holding two copies sees mismatched reference numbers on identical prices; the installer can't cite a stable quote number on a call. The share payload freezes createdAt correctly (16041), making PDF vs. link inconsistent too.
- **Evidence:** Line 15804: `doc.text(`Quote No. ${Date.now().toString().slice(-8)}`, ...)`; line 15803 prints new Date() on every export; line 15943: "This quote is valid for 30 days from the date above."
- **Recommendation:** Persist an issuedAt and a stable quoteNo (derived from job.id, e.g. its first 8 hex chars) on the job at first customer-facing export; print those on every regeneration and compute validity from issuedAt. Show a "re-issued" line only when the price actually changed.
- **Principle:** Trust & Ethics §1 — traceability makes the number believable; a reference the customer can't rely on reads as improvisation.
- **Breakage risk:** Old saved jobs lack issuedAt — fall back to updatedAt; e-sign expiry already anchors to snapshot createdAt so keep them consistent; resources-sync for the quote-validity wording.

### OUT-7 — Save gate interrupts document generation but never resumes it — and the Job Files card sits above the Save button it depends on
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** requireSavedJobForExport (15716–15723); layout order: Job Files card 5992–6095 before Save Job actions 6101–6111
- **Problem:** Tapping View/Download pre-save toasts "Save this job first to generate documents" and opens the save modal — good recovery — but after saving, the flow dead-ends: the user must scroll back, re-find the right card, and re-tap the button they already tapped. The visual order compounds it: all four artifact cards appear before the Save Job button, teaching users to reach for documents first and guaranteeing the interruption on every first job.
- **Evidence:** Lines 15720–15722: `toast("Save this job first to generate documents"); openSaveJobModal(); return false;` — no pending-action stash. doSaveJob (15234–15237) closes the modal and toasts, resuming nothing. Section order: files card starts at 5992, save actions at 6101.
- **Recommendation:** Stash the interrupted action (e.g. _pendingExport = () => exportCustomerPDF("view")) inside requireSavedJobForExport and invoke it after a successful doSaveJob; and/or add a compact save-status strip at the top of the Job Files card ("Unsaved quote — Save to generate documents" with a Save button) so the dependency is visible before the tap.
- **Principle:** Flow continuity / one-decision-per-step: an interruption must return the user to their goal (NN/g: user control and freedom); visibility of system status.
- **Breakage risk:** Pending-action must clear if the save is aborted/conflicted (saveConflictModal path) or the quota upsell fires, or a stale export could fire after a later unrelated save.

### OUT-8 — Save-conflict dialog makes destructive "Overwrite the existing job" the primary gold button
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** saveConflictModal (6319–6330), showSaveConflict (15242–15248)
- **Problem:** When a name collision occurs, the modal stacks three buttons with the irreversible option — overwriting a previously saved quote's numbers, with no undo anywhere in the app — styled as the primary gold CTA on top, while the safe "Save as a new quote" is the muted secondary. Thumb-flow and visual hierarchy both push users toward silent data loss of the older quote.
- **Evidence:** Line 6325: `<button id="saveConflictOverwrite" ... bg-[#b58f4a] text-slate-950 ...>Overwrite the existing job</button>` (primary gold); line 6326: "Save as a new quote" styled bg-slate-800 secondary. No undo path exists for the overwritten rows (doSaveJob 15218 replaces in place).
- **Recommendation:** Flip the hierarchy: "Save as a new quote" primary; restyle Overwrite as an outlined destructive (rose) button; ideally show the delta ("existing: $23,400 → this quote: $26,100") in saveConflictMsg so the choice is informed.
- **Principle:** UX-pitfalls §9 Prevent > Undo > Confirm — a confirm whose default is the destructive branch protects nothing; aerospace HMI: destructive actions never get the visually dominant affordance.
- **Breakage risk:** Pure styling/order change; verify light-mode overrides for the new destructive style (theme-parity).

### OUT-9 — E-sign Customize actively nudges installers to hide permit/inspection fees and silently re-labels their dollars as materials/labor
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** loadSignCustomize HIDE_HINT (16232–16249), reconcileLineItems (16190–16198), applySignExclusions (16202–16212)
- **Problem:** Rows matching /inspection|permit|disposal|lift|mobil/ get a highlight class explicitly because they're "rows installers most often want to hide" — the UI recommends concealment of exactly the fee categories regulators care about. When a fee line is hidden, its dollars are proportionally redistributed into "Windows, materials & hardware" and "Professional installation & labor" — the total stays honest, but the categorical attribution the customer signs becomes false (permit money labeled as materials). The code comment claims "nothing is misattributed" (16188–16189) while doing precisely that.
- **Evidence:** Lines 16233–16234: `// Rows installers most often want to hide get a subtle highlight. const HIDE_HINT = /inspection|permit|disposal|lift|mobil/i;` applied as jd-cz-important (16225). Line 16249: "Hiding a price line spreads its amount across the others — the total the customer signs never changes."
- **Recommendation:** Keep the capability (lump-sum quoting is legitimate) but remove the suggestive highlight; when a fee bucket is hidden, fold it transparently into the label ("Professional installation & labor (incl. permits & inspection)") instead of silent redistribution; or collapse to a single "Total installation price" line rather than fake-itemized lines.
- **Principle:** Trust & Ethics §6, FTC bucket 2 (hiding material information) — the tool's duty scales up because a pro is quoting a non-expert; honest itemization is the point of the itemized level.
- **Breakage risk:** Existing sign links are frozen snapshots — unaffected; label change must flow into renderSignedQuotePDF and the sign page renderer (4052–4059) which read snapshot lineItems verbatim.

### OUT-10 — "Copy signing link" silently performs a headless save that consumes a metered quote credit
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** copySigningLinkFromFiles (17637–17662)
- **Problem:** From the collapsed Job Files menu, "Copy signing link" on an unsaved quote copies STATE into the hidden save form and calls confirmSaveJob() with no modal and no notice — naming the job "Job 7/2/2026" if no customer was entered and spending one of the user's monthly quote credits. The user asked for a link; they were charged a save. Nothing on the button or in the flow discloses this cost, and on limited plans (Solo) each credit is 1/limit of the month.
- **Evidence:** Lines 17644–17653: `if (!saved) { ... set("saveJobName", STATE.customerName || ""); ... confirmSaveJob(); // quota-checked save; sets STATE.currentJobId...}` — no user-facing disclosure before the save; job name falls back to `Job ${date}` in doSaveJob (15180).
- **Recommendation:** If the quote is unsaved, open the (pre-filled) save modal with a one-line note "Signing links are created from saved jobs — saving uses 1 quote" instead of saving headlessly; or at minimum toast the consumption ("Saved as 'Job Jul 2' — 3 quotes left this month") before the link toast.
- **Principle:** Trust & Ethics §1/§6 — no charge (even an internal credit) without clear affirmative context; visibility of system status.
- **Breakage risk:** Adds one step to a currently one-tap power flow; keep it one-tap when the job is already saved (the common case).

### OUT-11 — Public quote footer warns the customer to distrust the link — a scam-style disclaimer directly under the price
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** renderPublicQuoteHTML provenance note (3913–3918)
- **Problem:** Every #/q/ quote ends with "Estimate prepared by the sender, not by AnchorQuoting — verify you know who sent this link." The anti-phishing motive is sound (the payload is client-authored), but to a homeowner evaluating a $20k price from their contractor, this reads as "this document may be fraudulent." It undermines the installer — Anchor's actual customer — at the exact peak-end moment, and it's the only sentence on the page in a warning register.
- **Evidence:** Lines 3916–3918: `'<div class="pq-powered">Powered by <span>Anchor</span> · Estimate prepared by the sender, not by AnchorQuoting — verify you know who sent this link.'`
- **Recommendation:** Reword neutrally: "Prepared and sent by {companyName} · Powered by Anchor" — provenance stated without alarm. The durable fix is OUT-1's server-side link, after which authenticity is real and the caveat can drop entirely. (The #/sign/ page already omits the warning — 4282–4283 — proving the softer standard is acceptable.)
- **Principle:** Trust & Ethics: honest provenance without manufactured doubt; tone: error/warning register reserved for actual risk (aerospace color-budget discipline applied to copy).
- **Breakage risk:** Slightly weaker phishing hedge until OUT-1 lands; keep "prepared by the sender" phrasing so the provenance fact remains.

### OUT-12 — Job Files collapse header is a non-focusable <div> and no result-card header exposes expanded/collapsed state
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: ADJUSTED`

- **Where:** Job Files rcard head (5993) vs. button heads (5881, 5926, 5955); toggle handler (17619–17626)
- **Problem:** Full Breakdown, Labor Detail, and Materials use real <button> headers, but Job Files — the card holding every output action — uses <div class="rcard-head jf-head">: unreachable by keyboard, silent to screen readers. And none of the four headers set aria-expanded, so AT users get no state when toggling. Collapsed cards hide their entire body (959: display:none), so a keyboard user who collapses Full Breakdown via its button gets state-blind toggling, and can never re-open Job Files if it starts collapsed.
- **Evidence:** Line 5993: `<div class="rcard-head jf-head border-b border-slate-800/80">` — a div, unlike line 5881's `<button type="button" class="rcard-head...">`. Handler at 17619–17626 toggles .collapsed with no aria-expanded sync. CSS 959: `.rcard.collapsed > :not(.rcard-head) { display: none; }`.
- **Recommendation:** Make the Job Files head a <button type="button"> like its siblings; in the shared click handler, sync aria-expanded on the head after classList.toggle; give the collapsed jf icon buttons their existing aria-labels a menu role check (17684 already labels them — good).
- **Principle:** WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value — disclosure widgets must be operable and announce state (accessibility.md floors).
- **Breakage risk:** Button reset styles could shift the jf-head layout — rcard-head CSS (938–941) already zeroes border/background, so risk is minimal; theme-parity spot-check.
- **Verifier adjustment:** Core defect confirmed: Job Files head is a non-focusable <div> (5993) while the other three rcards use <button> (5881/5926/5955); the toggle is a document-level click handler (17619–17626) with no aria-expanded sync (grep: no rcard head ever sets it); collapsed hides the whole body (CSS 959). Correction: collapse state is NOT persisted (no localStorage/restore code touches .rcard collapsed — grep confirms toggling exists only at 17624), so Job Files never 'starts collapsed' on load; the keyboard trap only arises mid-session after a pointer/touch collapse, after which keyboard users cannot re-open it. Keyboard users also can't collapse it in the first place — the div is unreachable in both directions.

### OUT-13 — Collapsed Job Files icon buttons and their menu rows are ~33–34px — below the touch floor, with no coarse-pointer bump
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** .jf-iconbtn (967–972), .jf-menu button (985), coarse-pointer precedent at 1230–1237
- **Problem:** When the Job Files card is minimized, the four artifact icons are 34×34px and the popover menu rows are ~33px tall (13px font + 8px padding). These are primary output actions on a mobile-first surface, yet only .edit-rate-btn got the documented pointer:coarse enlargement to 40px. Mis-taps here fire the wrong document action (e.g. Share instead of View).
- **Evidence:** Line 968: `width: 34px; height: 34px;` on .jf-iconbtn; line 985: `.jf-menu button { ... font-size: 13px; ... padding: 8px 9px; }`. The @media (pointer: coarse) block at 1232 covers .edit-rate-btn and .info-tip only.
- **Recommendation:** Extend the existing @media (pointer: coarse) block: .jf-iconbtn to 44×44 (or pad via ::after pseudo-hit-area), .jf-menu button padding to ≥12px vertical. Same treatment for .jf-btn (1038–1041, ~29px tall) on coarse pointers.
- **Principle:** data-display-and-density §8 — interactive targets stay 44–48px via padded hit areas; spacing-type-color §4 touch floor.
- **Breakage risk:** Larger icons may wrap the collapsed header row on 320px screens — test the 4-icon row at narrow widths; theme-parity unaffected.

### OUT-14 — Internal-only numbers (Projected Profit, markup %) sit unguarded beside the customer-presentable price — no field/present mode
`severity: low` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** Results hero + cards (5862–5877), markup label (5863–5865), contrast with Labor Detail's explicit "Internal" badge (5927)
- **Problem:** Contractors quote in the field with the phone often visible to the homeowner. The screen that shows the selling price simultaneously shows "Projected Profit $X" and "@ 35% markup" one swipe away from the customer's eyes. The app already recognizes this class of data — Labor Detail carries a gold "Internal" badge and the Cost Breakdown PDF says "not for the customer" — but the two most sensitive numbers of all have no such treatment or hideability.
- **Evidence:** Lines 5874–5876: `<div ...>Projected Profit</div><div id="profit" ... accent-glow>` rendered unconditionally; 5864: "Selling Price · @ 35% markup"; 5927 shows the existing Internal-badge pattern.
- **Recommendation:** Add a one-tap "Present" toggle near the hero that collapses profit/markup/per-LF (and auto-collapses Full Breakdown + Labor Detail) leaving the selling price and scope — the on-screen equivalent of the Customer Quote artifact. Persist per-session.
- **Principle:** Contextual design / aerospace levels-of-detail: the audience of the surface determines what renders; the app's own For-the-Customer vs For-the-Crew taxonomy applied to the live screen.
- **Breakage risk:** New visible control — needs light-mode styles (theme-parity) and a Resources guide entry (resources-sync); must not alter calculation or saved state.

### OUT-15 — Upsell modal shows the wrong consequence note for the AI-reads wall
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** upsellPhase2Note static HTML (6406), showUpsellModal (22577–22615), UPSELL_COPY (22536–22558)
- **Problem:** The note "Saving new quotes is paused until you upgrade or your billing cycle resets — your saved jobs and settings stay put" is static markup shown for every upsell reason. When the trigger is ai_reads_exhausted, saving is NOT paused — only AI plan reads are — so the modal tells the user their core workflow is blocked when it isn't, overstating the wall (a mild fake-urgency reading) and contradicting the body copy right above it ("You can still enter openings by hand anytime").
- **Evidence:** Line 6406: static `<p id="upsellPhase2Note">Saving new quotes is paused...` ; showUpsellModal (22586–22609) sets eyebrow/headline/body/plan card but never touches upsellPhase2Note; UPSELL_COPY has four distinct reasons (22537–22557).
- **Recommendation:** Move the note text into UPSELL_COPY per reason (ai_reads_exhausted: "AI reads are paused — manual entry and quote saving still work"), and set it in showUpsellModal alongside the body.
- **Principle:** Trust & Ethics §6 bucket 1 — no overstated consequences; message-matches-trigger consistency.
- **Breakage risk:** None; copy-only. Resources guide describes upsell behavior — quick resources-sync check.

### OUT-16 — Sign page and countersigned PDF hardcode "Florida law" for every installer in every state
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Sign form legal line (4106), countersigned PDF footer (16532–16535)
- **Problem:** The customer-facing consent line reads "Signed electronically under the U.S. E-SIGN Act and Florida law" and the certificate PDF repeats "applicable Florida law" — regardless of where the installer or customer is. For a non-Florida job this is a legally wrong assertion embedded in the most contract-like artifact the app produces; a sharp customer (or their lawyer) noticing it discredits the whole document.
- **Evidence:** Line 4106: `'<div class="sg-legal">Signed electronically under the U.S. E-SIGN Act and Florida law...'`; line 16533: "under the U.S. E-SIGN Act and applicable Florida law."
- **Recommendation:** Use the brand's state when present ("and applicable {state} law") falling back to "and applicable state law (UETA)" — E-SIGN plus generic UETA phrasing is accurate nationwide.
- **Principle:** Trust & Ethics — every verifiable claim in a financial artifact must be true; duty scales with the contract-like nature of the surface.
- **Breakage risk:** Existing signed records keep their original footer (rendered from frozen rows) — only new signatures change; confirm the sign-quote edge function doesn't also emit the Florida string (edge fns drift from repo — diff before assuming).

## Section: settings-rates

**Summary:** Settings is the make-or-break surface for the first-priced-job journey: new users land with demo rates and are banner-nudged here to enter their own. The architecture is genuinely good — tabs → leaves → collapsed cards with a first-class settings search, blur autosave, and contractor-language hints — but the demo-rates trust loop leaks at every joint: the banner CTA drops users on Brand & Company instead of the rates, one unrelated Brand edit permanently clears the 'sample rates' warning (ratesCustomized flips on any commit), out-of-range entries are silently discarded under a green 'Saved' flash, and the most-edited money fields use type=number where a scroll can silently change a committed price. PR #39's eight new labor-model fields arrive miscategorized (trim-nail settings under 'Repeating floors & high-rise'), invisible to search, unreachable from the breakdown's pencil deep-links, and with a hidden 70% efficiency floor that contradicts what the user types. Mobile ergonomics undercut the field-use case with sub-44px nav pills and 14px inputs that re-trigger iOS zoom, and the one piece of real help — the plain-English Resources guide — is gated to the owner account. Fix the four high findings and the golden path (banner → rates → verified numbers → trustworthy first quote) becomes coherent; the underlying disclosure and feedback patterns are already the right ones to build on.

**Strengths (do not regress):**
- Settings search (6461–6475, 18823–19049) is a genuinely excellent escape hatch for the deep hierarchy: a full ARIA combobox (role, aria-expanded, aria-activedescendant, polite result-count live region), keyboard navigation, and an index rebuilt on focus from live DATA so renamed materials stay findable. Later phases must keep registering new fields in it (see SET-5) — do not regress this.
- The quiet autosave model (19574–19595) with the pre-mounted polite 'Saved' live region (2462–2477, 19566–19572) and a whole-form, NaN-guarded commit is the right persistence pattern for a many-field rate editor — no save-button anxiety, screen-reader announced, debounced for cloud sync. Preserve it when adding validation (SET-2).
- Progressive disclosure in Window Rates is well executed: material cards collapse to meaningful summaries (default brand + aligned tabular price + variant count, 18691–18711) with per-card memory in localStorage (19277–19301), so a one-brand shop sees ~8 calm rows instead of ~70 open inputs. The Money & Tax leaf correctly leads with 'The numbers that drive every quote — change these first' (6707).
- Field-level explanation in contractor language is strong where it exists: every Money/Labor field has a purpose hint (6712–6722, 6757–6815), and the two live readouts — crew cost/hr (19331–19340) and the repeat-floor worked example '10 identical floors price like ~X' (6818, 19320–19329) — make abstract multipliers tangible. This is the pattern SET-6/SET-14 should extend, not replace.

### SET-1 — Demo-rates warning self-destructs on any unrelated Settings edit
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** commitAdmin (line 19546) + autosave wiring (19579–19595) + renderDemoBanner (23873–23877); banner HTML 5827–5833
- **Problem:** The only global 'you are quoting on sample rates' signal is the amber demoBanner, gated on DATA.config.ratesCustomized. commitAdmin unconditionally sets ratesCustomized = true, and the blur/change autosave calls commitAdmin for ANY field in the Setup or Rates panels — with no dirty check (queueSave fires on plain focusout). A new user who opens Settings and types only their company name on the Brand leaf permanently kills the sample-rates warning while every material price is still a demo number. Quotes then go out priced on someone else's costs with no warning.
- **Evidence:** Line 19546: `DATA.config.ratesCustomized = true;` runs at the end of every commitAdmin. Lines 19586–1594: `queueSave` fires on `focusout`/`change` for anything inside `.set-panel[data-panel="setup"], .set-panel[data-panel="rates"]` with no value comparison. Line 23876: banner hidden whenever ratesCustomized is set. Brand fields (6521–6558) live in the setup panel, so editing the company name triggers the same commit.
- **Recommendation:** Only flip ratesCustomized when a field that actually feeds pricing (Rates panel inputs, material variants, labor model) changes value — compare before/after inside commitAdmin, or set the flag in the specific read-back blocks for rates. Optionally downgrade the banner to 'N rates still unverified' driven by the existing per-item unverified flags instead of a single boolean.
- **Principle:** Trust & system status (NN/g visibility of system status); states-and-feedback — a warning about wrong data must not clear until the data is right
- **Breakage risk:** If detection is too strict the banner could persist for users who legitimately customized rates pre-change; run resources-sync since the guide likely describes when the sample-rates banner clears.

### SET-2 — Out-of-range values are silently discarded while the header flashes 'Saved'
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** commitAdmin range guards (19382–19422) + flashSettingsSaved (19566–19572); no error UI anywhere in adminModal (6438–7214)
- **Problem:** Every numeric read-back is NaN/range guarded (markup ≥0, impact labor ≥1, nail spacing 4–48, crew size 1–30, height cap 1–10, etc.) but a rejected value is simply skipped: no inline error, no aria-invalid, no revert. The input keeps displaying the rejected number and the autosave still flashes the green 'Saved' indicator. A contractor typing 0.9 into 'Impact labor ×' or 60 into 'Nail spacing (in)' sees 'Saved' and believes it — the on-screen number and the number pricing the quote now disagree until the modal is rebuilt.
- **Evidence:** Line 19385: `if (!isNaN(impLabor) && impLabor >= 1) DATA.config.impactLaborMultiplier = impLabor;` — else nothing happens. Line 19418: brad spacing only stored when `>= 4 && <= 48`. Lines 19587–1590: autosave path always ends in `flashSettingsSaved()`. There is no error element, aria-invalid, or field revert in the settings markup (6438–7214).
- **Recommendation:** Adopt validate-on-blur: when a value fails its guard, mark the field (aria-invalid + linked error text stating the allowed range) and either keep it errored or revert it to the stored value; suppress the 'Saved' flash when any field was rejected. WCAG 3.3.1 requires the error identified in text and programmatically associated.
- **Principle:** forms-and-inputs §5–6 (error association, reward-early-punish-late); WCAG 2.2 SC 3.3.1 Error Identification
- **Breakage risk:** New error styles need [data-theme="light"] overrides (theme-parity); reverting on blur must not fight the 600ms autosave debounce or the settings-search focus jumps.

### SET-3 — type="number" on the exact money fields new users must edit (scroll-to-change + spinner)
`severity: high` · `kind: flaw` · `effort: S` · `verdict: ADJUSTED`

- **Where:** Material cards: consumption inputs (18678), unit-price (18751), per-application price (18729), variant price rows (19311); manufacturer screw fields (18543–18547)
- **Problem:** The Window Rates cards — the core 'enter MY rates' surface — use `<input type="number" step="0.001">` without the app's own .num-input spinner-strip class. On desktop, focusing a price and scrolling the (very long) rates panel silently increments/decrements the value; the spinner is an easy mis-tap on mobile; Chrome silently drops non-numeric characters with no AT notification. Because autosave commits on blur, an accidentally scrolled price is persisted with only a quiet 'Saved'. It is also internally inconsistent: Money & Tax and the Crew card correctly use type="text" inputmode="decimal" (6711, 6716, 6721, 6756, 6761).
- **Evidence:** Line 19311: `<input type="number" step="0.001" min="0" class="var-price control …"` — no .num-input class (spinner-strip CSS at 118–120 applies only to .num-input). Line 18678: consumption `type="number" step="0.001"`. Line 18751: unit price `type="number"`. Contrast with line 6711: `type="text" inputmode="decimal"` for adminMargin.
- **Recommendation:** Convert all rate/price/consumption inputs to `type="text" inputmode="decimal"` (the pattern already used in Money & Tax), parse in commitAdmin (it already parseFloats), and format on blur.
- **Principle:** forms-and-inputs §2 — the GOV.UK type=number ban (scroll-wheel bug, spinner mis-taps, silent character discard)
- **Breakage risk:** commitAdmin already parseFloats so logic holds; check nothing relies on the browser's number validation or step; visual width of w-20/w-24 fields unchanged.
- **Verifier adjustment:** Core finding confirmed: consumption (18678), per-application price (18729), unit price (18751) and variant price (19311) are all type="number" step="0.001" WITHOUT .num-input (spinner-strip CSS at 118-120 targets only .num-input), while Money & Tax and Crew fields use type="text" inputmode="decimal" (6711, 6716, 6721, 6756, 6761) — the inconsistency and scroll/blur-autosave risk are real. Correction: the manufacturer screw fields (18543-18547) DO carry .num-input via numCls at 18514, so spinners are stripped there; they remain type=number (still wheel-scroll-vulnerable) but should not be cited as lacking the app's spinner-strip class.

### SET-4 — 'Update your rates' banner CTA lands on Brand & Company, not the rates
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** demoBanner CTA (5831, wired at 24448) → openAdmin (16891–16908) → showSettingsTab("setup") (16900) with Brand leaf active (6496)
- **Problem:** The banner promises 'update them with your real costs' but its button just calls openAdmin, which hard-codes the Setup tab, whose default leaf is Brand (logo/company/county). The new user lands on branding fields and must self-discover the 'Rates & Pricing' tab, then a leaf, then expand cards, to reach any actual rate. openAdmin also resets to Setup on every reopen, so a user bouncing between the cost breakdown and Settings mid-rate-entry loses their place each time.
- **Evidence:** Line 24448: `document.getElementById("demoBannerSettings").addEventListener("click", openAdmin);`. Line 16900: `showSettingsTab("setup")` runs unconditionally inside openAdmin. Banner copy at 5829: 'You're using sample rates — update them with your real costs for accurate quotes.'
- **Recommendation:** Have the banner CTA open Settings directly on Rates & Pricing (e.g. `openAdmin(); showSettingsTab("rates")` — openSettingsToItem at 16984 already shows the pattern), and remember the last-active tab for reopens within a session.
- **Principle:** Deep links must land on the promised destination (navigation-depth §3); minimize interaction cost on the golden path (NN/g)
- **Breakage risk:** Other openAdmin callers (PFP menu, nudge) expect the Setup default — parameterize rather than change the default; settings search reset logic in openAdmin must still run.

### SET-5 — PR #39's trim-nail fields are filed under 'Repeating floors & high-rise', and none of the 8 new fields are searchable
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Labor card sub-header + fields (6774–6816); commitAdmin storage (19414–19418); search index (18835–18926)
- **Problem:** Inside the Crew & Time card, the gold 'Repeating floors & high-rise' sub-header (6775) is followed by eight fields — but two of them, 'Finish-nail box $' (6798) and 'Nail spacing (in)' (6803), are interior-trim consumable settings stored in DATA.config.trim, with zero relation to high-rise work. A contractor hunting trim-nail pricing will never look under high-rise; a high-rise reader is baffled by nail boxes. Compounding it, buildSettingsSearchIndex registers only three Money & Tax fields as Fields, and the Labor leaf's keywords ('labor rate bill install hourly impact crew') contain none of: swing stage, height, floor, efficiency, nail — so searching for any of the new PR's settings returns 'No matches'.
- **Evidence:** Lines 6797–6806: adminBradBoxPrice / adminBradSpacing sit between 'Swing stage setup $' and 'Swing stage from (stories)' under the high-rise header. Lines 19414–19418: values stored in `DATA.config.trim`. Lines 18903–18909: only adminMargin/adminTax/adminImpactLabor indexed as Fields; line 18888 Labor keywords lack all new terms.
- **Recommendation:** Move the two trim fields to their own 'Interior trim' group (or into the Interior Trim material card where the rest of trim lives), and add Field entries (or at least leaf keywords) for repeat-floor efficiency, height premium/cap, swing stage rate/setup/min-stories, and the trim-nail fields.
- **Principle:** Card-sorting / match between system and mental model (NN/g); mobile-patterns §6 chunking — group by user concept, not by commit order
- **Breakage risk:** openSettingsToItem/search targetIds reference these input ids — keep ids stable when regrouping; run resources-sync if the guide names where these settings live.

### SET-6 — Repeat-floor efficiency has a hidden 70% floor that contradicts what the user typed
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Field + hint (6777–6781), readout clamp (19320–19329), pricing clamp (8626), commitAdmin (19405–19406)
- **Problem:** The hint says 'Each identical repeat floor costs this % of full install labor' and commitAdmin accepts 0–100, but pricing clamps the value at repeatFloorMinFactor 0.70. Enter 50 → the field shows 50, the stored value is 0.5, and the quote prices at 70%. The live example readout also silently uses the clamped value (typing 50 shows '10 identical floors price like ~7.3', not ~5.5) with no explanation, which reads as a bug and undermines trust in the whole labor model.
- **Evidence:** Line 19327: `const eff = Math.min(1, Math.max(LM.repeatFloorMinFactor ?? 0.70, pct / 100));`. Line 8626: same clamp in the pricing path. Line 19406 accepts `rfEff >= 0 && rfEff <= 100` unclamped into config. Hint at 6780 mentions no floor.
- **Recommendation:** Either validate the input to 70–100 with the floor stated in the hint ('70% minimum — crews never get faster than this'), or show 'floored at 70%' in the readout when the entered value is below it, and store the clamped value.
- **Principle:** Trust in pricing math — never let displayed input and effective value diverge silently (surprise-totals rule); forms §6 validation
- **Breakage risk:** Clamping on save changes stored config for users who already entered <70; resources-sync — the 70% floor is a 'key number' the guide should state.

### SET-7 — Labor and each Door type hide their only content behind a redundant third disclosure
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** sc-rates-labor (6734, no data-collapse-open), sc-rates-doors-swing/sliding/bifold (6850, 6939, 7022), applyStaticCollapseState default (19292–19301)
- **Problem:** Reaching door rates already takes: Settings → Rates & Pricing tab → Doors leaf → door-type pill. After all that, the single visible section is STILL a collapsed <details> ('Sliding Glass Doors — Labor, panel size & screw inspection') needing a fourth tap before any field appears. Same for the Labor leaf: tapping 'Labor' shows one collapsed summary row. The code's own comment (19297–19299) states single-section leaves should start expanded 'no point hiding the only thing in the leaf' — but Labor and each door view render exactly one card and still default closed.
- **Evidence:** Lines 6734, 6850, 6939, 7022: these <details> lack the data-collapse-open attribute; line 19300: `el.open = (pref != null) ? !pref : el.hasAttribute("data-collapse-open")` → default closed. Door-type pills at 6844–6848 already guarantee only one section is visible at a time.
- **Recommendation:** Add data-collapse-open to sc-rates-labor and the three door sections (or auto-open the visible section in showDoorType/showRatesLeaf). Saved user collapse prefs still win, so nothing regresses for users who deliberately closed them.
- **Principle:** Progressive disclosure ≤2 levels (mobile-patterns §6 via navigation-depth §1) — every extra tap-through sheds users
- **Breakage risk:** Settings-search jump and openSettingsToItem already force-open these details — verify no double-toggle; per-user rates_collapse prefs override the new default (intended).

### SET-8 — Customers detail card silently discards unsaved edits, in a modal that autosaves everywhere else
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** custDetailHTML Save button (14949), back handler (24227), Done button (6457); autosave scope (19583–19584)
- **Problem:** Setup and Rates autosave on blur with a 'Saved' flash, training the user that Settings never needs a save press. The Customers tab breaks that model: its detail card has an explicit Save button, and tapping '‹ All customers' (or the header Done) simply re-renders from stored data — typed changes to phone/email/address vanish with no dirty-check or warning. Two opposite persistence models inside one modal guarantees lost edits.
- **Evidence:** Line 24227: `if (e.target.closest("[data-cust-back]")) { _custDetailKey = null; renderCustomersSettings(); return; }` — no commit, no confirm. Lines 19583–1584: autosave explicitly limited to `.set-panel[data-panel="setup"], .set-panel[data-panel="rates"]`. Save exists only as the per-card button at 14949.
- **Recommendation:** Autosave customer fields on blur like the rest of Settings (name changes committed only on blur since the customer key derives from the name), or at minimum dirty-check on back/Done and confirm before discarding.
- **Principle:** Consistency & standards (NN/g #4); never lose user input (ux-pitfalls form-abandonment)
- **Breakage risk:** Customer key = lowercased name (14893–14895 fallback logic), so mid-rename autosave could split one customer into two records — commit renames atomically on blur; changes propagate to all saved jobs, so a stray autosave has wide blast radius.

### SET-9 — The 'tap ✎ to fix this rate' loop is broken for sliding, bifold, and swing-stage rows
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** openSettingsToItem mapping (16992–17010, 17028–17039); breakdown editability flag (10208); row ids at 9386/9391, 9426/9431, 9549
- **Problem:** The breakdown's pencil→Settings deep-link is the primary path from 'this number looks wrong' to fixing it. openSettingsToItem only maps labor and swing_doors_*; everything else defaults to the Window Rates leaf. Sliding (isSlidingDoor), bifold (isBifoldDoor), and swing_stage rows don't satisfy the `(item && …) || row.isSwingDoor` editability test, so they render no pencil at all — the learned affordance disappears exactly on the rows this PR added, and even if invoked their ids would dead-end on the wrong leaf. A user who spots a wrong swing-stage or bifold-flashing charge has no route to the setting (which lives three levels deep under Labor or Doors).
- **Evidence:** Line 10208: `const editable = (item && row.id !== "tax") || row.isSwingDoor;` — sliding/bifold rows set isSlidingDoor/isBifoldDoor (9391, 9431), swing_stage sets neither (9549), none are costItems. Lines 16992–16996: leaf routing covers only "labor" and ids starting "swing_doors".
- **Recommendation:** Extend editable to the new flags and add map entries: sliding_doors_* → doors leaf + showDoorType('sliding') + adminSgd* highlight; bifold_doors_* → doors/bifold; swing_stage → labor leaf + adminSwingStageRate highlight; brad_nails/trim rows → their new home per SET-5.
- **Principle:** Consistency of interaction patterns (NN/g); direct-manipulation shortcut parity — every cost line should be one tap from its control
- **Breakage risk:** Must not disturb existing swing_doors_* jumps; highlight targets need the door section force-opened (mirrors existing scKey logic at 17003–17009).

### SET-10 — Settings navigation chrome is below the 44px touch floor
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** .set-tab (2429–2435; mobile 2551), .rleaf-btn (2481), .rdoor-btn (2516), variant remove × (19313), mfr-del × (18521), logo buttons (6517–6518), checklist buttons (6836–6837)
- **Problem:** The entire settings hierarchy is driven through sub-44px controls: tabs ≈37px tall (≈35px in the mobile scroll strip), leaf pills ≈36px, door pills ≈31px, and the destructive per-row '×' buttons (remove variant, delete manufacturer — the latter nested inside a <summary>, doubling mis-tap consequences) are ~20px squares. Contractors doing rate entry on a phone in the field will mis-tap between adjacent leaves and accidentally hit deletes.
- **Evidence:** Line 2431: `.set-tab { padding: 9px 13px; font-size: 13px }` → ~37px. Line 2516: `.rdoor-btn { padding: 6px 15px; font-size: 12px }` → ~31px. Line 19313: `class="var-remove btn … px-1 text-base"`. Header Done and footer Restore Defaults DO carry min-h-[44px] (6457, 7210), so the floor is already a known convention here.
- **Recommendation:** min-height:44px on .set-tab/.rleaf-btn/.rdoor-btn; give the × buttons a 44px hit area via padding (visual size can stay small); move mfr-del out of the summary hit path or add a confirm.
- **Principle:** 44px touch-target floor (Apple HIG / accessibility.md); destructive actions need larger, isolated targets
- **Breakage risk:** Taller pills change wrapping in the mobile horizontal tab strip (2548–2552); re-run theme-parity after resizing since active-state pills have light overrides (3673–3680).

### SET-11 — 14px inputs outside .set-field re-trigger iOS zoom-on-focus for most of the rate-entry session
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Brand fields (6524–6557), Job Defaults selects (6577–6597), consumption inputs (18678), variant rows (19309–19311), mfr editor (18514, 18524, 18543–18547); the 16px guard at 2477 and 2493
- **Problem:** The codebase knows the rule — '.set-field input… { font-size: 16px }' exists precisely to stop iOS zoom — but only fields inside .set-field get it. The Brand leaf, Job Defaults, every material card's consumption and brand-variant inputs, and the manufacturer editor all render at text-sm (14px) or text-xs, so on an iPhone each focus zooms the whole modal and the user must pinch back out — dozens of times during a full rate entry. The most-touched fields are exactly the unprotected ones.
- **Evidence:** Line 2477: `.set-field input, .set-field select, .set-field textarea { font-size: 16px; }` with comment 'settings inputs ride >=16px to stop iOS zoom-on-focus'. Line 6524: brandCompanyName `class="control … text-sm …"` in a plain grid div. Line 19309: `.var-brand … text-sm`. Line 18514: mfr numeric inputs `text-xs`.
- **Recommendation:** Broaden the rule to `#adminModal input.control, #adminModal select.control, #adminModal textarea.control { font-size: 16px; }` (or wrap the remaining fields in .set-field).
- **Principle:** forms-and-inputs §8 — ≥16px inputs are the only accessible zoom fix; never suppress user zoom
- **Breakage risk:** 16px text in the w-16/w-20 mfr and variant price boxes may truncate — widen those inputs slightly; verify light mode (control overrides at 2865–2876).

### SET-12 — Load-bearing hint text sits below the 4.5:1 contrast floor
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: ADJUSTED`

- **Where:** .set-hint (2461), .set-sub (2444), inline slate-600 label suffixes (e.g. 6539), unit labels (18679, 19310–19312)
- **Problem:** In this territory the hints ARE the documentation — 'Added on top of your cost to get the selling price', 'Each identical repeat floor costs this % of full install labor'. They render at 11–12px in #64748b on #020617 (~3.8:1), and the secondary label text ('· sets the Materials Tax rate', '$/unit' suffixes) uses slate-600 (~2.6:1). Small text at this contrast fails WCAG AA and is genuinely hard to read outdoors on a phone — the exact context where contractors use this app.
- **Evidence:** Line 2461: `.set-hint { font-size: 11px; … color: #64748b; }`. Line 2444: `.set-sub { font-size: 12px; color: #64748b; }`. Line 6539: County label suffix `text-slate-600`. Modal background #020617 (6438).
- **Recommendation:** Raise hint/sub color to slate-400 (#94a3b8, ~7:1) or at least a ~4.6:1 value, and bump the 11px hints to 12px; reserve slate-600 for true decoration only.
- **Principle:** WCAG 2.2 SC 1.4.3 — 4.5:1 for normal text (spacing-type-color §4)
- **Breakage risk:** Light-mode hint colors are separately themed (3602–3672) — theme-parity pass required so light hints don't end up darker than labels.
- **Verifier adjustment:** Markup/positions verified: .set-hint 11px #64748b (2461), .set-sub 12px #64748b (2444), slate-600 suffixes (6539), text-slate-500 unit labels (18679, 19310-19312), modal bg #020617 (6438). Correction to the math: #64748b (slate-500) on #020617 is ~4.2:1 (on the slightly lighter .set-card fill ~4.1:1), not ~3.8:1 — still below the 4.5:1 AA floor for 11-12px text, so the finding stands; slate-600 (#475569) at ~2.7:1 is confirmed as cited (~2.6:1).

### SET-13 — The plain-English Resources guide is hidden from every user who needs it
`severity: medium` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED`

- **Where:** resourcesTabBtn gating (16898, 6486); renderResources (16932–16975)
- **Problem:** renderResources renders exactly what a first-time rate-enterer needs — a per-subsystem 'how it works / how it connects / good numbers to know' guide plus a downloadable PDF — but the tab is hidden unless isAdmin(), i.e. visible to one account. Regular contractors setting up 20+ rates have no in-app reference in Settings beyond one-line field hints; questions like 'what does consumption per LF mean?' or 'what's a repeat-floor efficiency?' have no answer surface.
- **Evidence:** Line 16898: `rb.classList.toggle("hidden", !isAdmin())`. Line 6486: tab ships with class `hidden`. The panel copy (7201) even addresses seller/customer questions, and the guide is already lazily fetched as a static JSON (16938) so exposing it costs nothing at load.
- **Recommendation:** Expose the Resources tab (renamed 'Help & guide') to all signed-in users, keeping the admin-only Feedback/Admin tabs gated; link relevant guide sections from the Rates leaves ('What do these numbers do?').
- **Principle:** Help & documentation (NN/g #10); progressive disclosure of learning content at the point of need
- **Breakage risk:** Guide content must be user-safe and current — the resources-sync skill exists for exactly this and should run before exposing it; light-mode styles for .res-* already exist (1013–1015).

### SET-14 — Material consumption rows are labeled with raw data keys ('default', 'Nail-fin')
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** buildAdminUI rate rows (18675–18681); friendly-label precedent at 18767
- **Problem:** Each material card's Consumption section prints the internal rates key verbatim: users see a row literally labeled 'default' with a value and 'oz/LF', next to keys like 'Nail-fin', 'Equal Leg', 'Block Framed' — with no hint that these are per-linear-foot usage amounts keyed to install type, or which job setting selects which row. The Labor card maps its keys to friendly names (RATE_LABELS: default → 'Stick Framed'), so the fix pattern already exists but wasn't applied to materials — the panel a new user must audit line by line.
- **Evidence:** Line 18677: `<span class="text-xs …">${k}</span>` renders the raw key. Line 8112: `rates: { default: 2.25 }` → user-visible row 'default 2.25 oz/LF'. Line 18767: `RATE_LABELS = { "default": "Stick Framed", … }` used only for labor.
- **Recommendation:** Reuse/extend the label map for all cost items ('default' → 'All installs (base)', keys → their application names) and add a one-line hint under the Consumption header: 'How much gets used per linear foot of window, by install type.'
- **Principle:** Speak the user's language (NN/g #2); every number must say what it drives (forms label anatomy)
- **Breakage risk:** Display-only (data-key attributes keep raw keys for commitAdmin at 19428–19435); update the Resources guide wording via resources-sync if it references these rows.

### SET-15 — No 'still on demo numbers' visibility inside Settings itself
`severity: medium` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** Card summary markup (18691–18711, 18737–18745); unverified flags (8112–8185) cleared at 19433/19466–19467; badge exists only in breakdown (10199–10200)
- **Problem:** Every cost item carries an unverified flag and commitAdmin carefully clears it on edit, but the Rates panel renders no trace of it — collapsed card summaries show brand + price with no marker for which are still placeholder numbers. The 'replace demo rates in one sitting' task has no progress cue or done-state; the user must bounce to the calculator's breakdown (where the amber 'Unverified ✎' badge lives) to know what's left.
- **Evidence:** Card summary at 18704–18711 renders name, default brand, price, variant count — no unverified state. Line 10199: `const verifyBadge = (item && item.unverified) ? …` exists only in the breakdown table renderer.
- **Recommendation:** Amber 'demo' dot on unverified cards' collapsed summaries plus a counter on the leaf nav ('Window Rates · 6 to verify'); optionally a 'verify next →' stepper that walks the unverified list — turning rate entry into a completable checklist.
- **Principle:** Visibility of task progress / goal-gradient (states-and-feedback); smart defaults must be visibly provisional
- **Breakage risk:** Badge must re-render after each autosave commit (buildAdminUI isn't re-run on autosave — update summaries in place); amber badge needs light-mode styling (theme-parity).

### SET-16 — 'Restore Defaults' in the persistent footer resets far more than the visible tab
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Footer button (7210), footer visibility (16918–16919), restoreDefaults (19597–19611)
- **Problem:** The footer pairs 'Restore Defaults' directly beside the primary 'Save' on both Setup and Rates tabs. Its actual scope is global: brand info, manufacturers, labor model, tax, AND custom FL approval patterns — communicated only through a native confirm() paragraph. Sitting on the Setup tab it reads like 'reset these setup fields'; one habitual OK on the confirm wipes an afternoon of rate entry (cloud-synced, no undo).
- **Evidence:** Line 19602: `DATA = clone(DEFAULT_DATA);` after a single confirm (19598). Line 16919: footer shown for both setup and rates tabs. Button label at 7210 carries no scope ('Restore Defaults').
- **Recommendation:** Rename to 'Reset ALL rates & setup…', move it off the primary footer (e.g. Account leaf or an overflow menu), and use a styled dialog listing kept vs. wiped data with a type-to-confirm or an undo window.
- **Principle:** Error prevention for destructive actions (NN/g #5); destructive actions never adjacent to primary actions
- **Breakage risk:** Users who rely on it for recovery must still find it; new dialog needs light-mode styles.

### SET-17 — Feedback textarea is placeholder-labeled with no accessible name
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** feedbackModal (7219–7257), textarea 7234–7235, kind-swapped placeholder 17836–17839
- **Problem:** The feedback message field has no visible label and no aria-label — its only naming is a placeholder that changes with the Feature/Bug toggle and disappears the moment the user types. Screen-reader users get an unnamed multiline field; sighted users mid-edit lose the prompt ('What went wrong? What were you doing?') exactly when writing a bug report needs it.
- **Evidence:** Line 7234: `<textarea id="feedbackMessage" rows="5" maxlength="4000" placeholder="What would make Anchor better for you?" …>` — no label element or aria-label anywhere in the form (7229–7248).
- **Recommendation:** Add a small visible label (or at minimum aria-label) that mirrors the kind-specific prompt; keep the placeholder as an example, not the label.
- **Principle:** Never placeholder-as-label (Baymard; forms-and-inputs §5)
- **Breakage risk:** None meaningful; a visible label adds ~20px to a modal that fits comfortably.

### SET-18 — The supplier pricing checklist — a great onboarding tool — is hidden as two ambiguous 10px buttons
`severity: polish` · `kind: improvement` · `effort: S` · `verdict: ADJUSTED`

- **Where:** Window Rates header buttons (6836–6837), wiring 24437–24438
- **Problem:** The 'Checklist PDF' (a fill-in-the-blanks sheet of every price to collect from suppliers, exactly what a new user needs before rate entry) is presented as two tiny 10px uppercase buttons, one of which is just 'View' with no object. Nothing explains what the checklist is, and it appears only on the Window Rates leaf where a user is already past the point of needing it.
- **Evidence:** Line 6836: `<button … id="adminChecklistView" class="… text-[10px] …">View</button>`; line 6837: 'Checklist PDF'; handlers export a pricing checklist (24437–24438: `exportPricingChecklistPDF`).
- **Recommendation:** One clearly labeled control ('Print supplier price checklist') with a one-line explainer, surfaced also from the demo banner / setup nudge flow; fold View/Download into the tap.
- **Principle:** Recognition over recall; label buttons with verb + object (ux-copy)
- **Breakage risk:** None; keep both export modes reachable.
- **Verifier adjustment:** The Settings-side presentation is as described: two text-[10px] buttons 'View' and 'Checklist PDF' (6836-6837) in the Window Rates header, wired to exportPricingChecklistPDF (24437-24438), with no explanation of what the checklist is. Correction: it does NOT appear only there — the first-run setup wizard also offers 'View' / 'Download Checklist' buttons (5075-5076, wired at 24444-24445), i.e. new users are shown it before rate entry. The discoverability claim should be scoped to users who skipped or forgot the wizard; the tiny-ambiguous-buttons critique stands.

## Section: design-system-css

**Summary:** The CSS layer (lines 100–3727) is a component-rich, dark-first system with real mobile craft — a sticky live-total bar, bottom-sheet modals, broad reduced-motion discipline — that directly serves quoting in the field. But it has no semantic token tier: :root defines only six gold variables (101–109) while #c9a558 appears 296 times, #64748b 98 times, and rgba(181,143,74,…) 131 times as raw literals, so every contrast/theme decision is re-made ad hoc and light mode survives only via a ~900-line override sheet (2826–3726) of !important patches keyed to Tailwind class names — the exact drift machine the 2026-06-26 'consolidated contrast fixes' block documents. On the first-login→first-priced-job path this shows up concretely: the auth modal greets users with placeholder-only 14px fields whose placeholders sit near 2.5:1, and the calculator/dashboard lean on 9–13px slate-500/600 micro-text that misses the AA floor on both themes, in sunlight, on the phones this app is built for. Focus indication and touch-target floors are enforced beautifully in some components (modal-close 44px, seg-btn focus ring) and skipped entirely in others (job-status select outline:none, 22px door-row delete), which is the signature of a strong pattern library missing its enforcement layer.

**Strengths (do not regress):**
- Mobile sticky live-total bar #mtotalBar (425–454) is doctrine-grade: fixed thumb-zone selling price with safe-area insets, an SR-only live region (.mtotal-sr 446), tabular-nums, and a prefers-reduced-motion gate — later phases must not lose this anchor when touching the calculator.
- The .sheet-on-mobile pattern (459–477) converts any centered modal into a bottom sheet on phones with one class: 92svh cap, sticky grab handle, overscroll-behavior:contain, safe-area bottom padding, reduced-motion fallback — a genuinely reusable system hook, keep applying it to new modals (flModal already uses it, 7264).
- Reduced-motion coverage is unusually disciplined: 12+ @media (prefers-reduced-motion) blocks (454, 477, 1156–1160, 1297–1301, 1860, 1982, 2038, 2084, 2135–2143, 2473) including correct END-STATES for the landing board-slam and materials-check animations rather than just killing them.
- Numeric and hit-area craft where it was done: font-variant-numeric:tabular-nums applied systematically to money/measure displays (233, 444, 1445, 3288); .modal-close standardized at 44×44 (1693–1704); @media (pointer:coarse) hit-area bumps for edit-rate-btn and info-tip (1230–1238). These are the internal precedents the fixes below should copy.

### DS-1 — No semantic token tier — six gold variables plus thousands of raw literals; light mode is a 900-line manual override sheet
`severity: high` · `kind: flaw` · `effort: L` · `verdict: CONFIRMED`

- **Where:** index.html :root 101–109; light theme block 2826–3726 (esp. 2948–2979, 3527 audit header)
- **Problem:** Every color decision outside gold is a hardcoded literal, so dark is the only theme the system actually knows. Light mode is produced by overriding Tailwind utility class names and component classes one by one with !important. Any new UI ships dark-only and silently breaks in light until someone patches it — which is why the theme-parity skill and the '2026-06-26 consolidated contrast/visibility fixes' block exist. For the user this means recurring white-on-white/invisible-border regressions in light mode.
- **Evidence:** :root (101–109) defines only --gold/--gold-hi/--gold-pale/--gold-lo/--gold-glow/--gold-soft. Grep counts: #c9a558 ×296, #64748b ×98, #94a3b8 ×91, rgba(181,143,74,…) ×131 — even though --gold-hi IS #c9a558. Light block spans 2826–3726 with patch strata labeled P0/P1/P2 under a comment 'consolidated contrast/visibility fixes (audit 2026-06-26)' (3527), proving the fix-drift-fix cycle.
- **Recommendation:** Introduce a semantic tier (--color-bg, --color-surface-1/2, --color-border, --color-text-1/2/3, --color-accent, --color-accent-soft, semantic success/warn/danger trios) aliased to the existing values; re-map that tier once under [data-theme="light"]; migrate component CSS surface-by-surface (rail → results → dashboard), deleting the corresponding utility-override patches as each surface converts. Two-tier is shippable; no big-bang rewrite.
- **Principle:** tokens-theming.md §1/§7 — 'a literal appears exactly once, in a primitive; theme = re-map of the semantic tier, not N edits'
- **Breakage risk:** High-touch: every migrated surface must be re-verified in BOTH themes (run theme-parity per batch); removing an !important utility override too early re-exposes the old light-mode bug it was masking. No user-facing numbers change, so resources-sync is unaffected.

### DS-4 — slate-500/600 micro-text fails WCAG AA on dark surfaces — and the light-mode remap makes text-slate-600 2.6:1 on white
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** index.html 821 (#liveRecap.is-empty), 1036 (.jf-desc), 3074 (.dash-thumb-empty), 3123 (.dlb-empty), 3286 (.dash-mat-table th), 3299 (.jd-photo-empty), 3388 (.jd-cz-note), 3423 (.esign-audit-k), 2957 (light remap)
- **Problem:** Real content — empty-state guidance, file descriptions, table headers, audit values — is set in #64748b (≈4.2:1 on #020617, ≈3.7:1 on the #0f172a card surfaces) and #475569 (≈2.7:1) at 9–13px, where the AA floor is 4.5:1. Contractors quoting outdoors in sunlight are exactly the population low contrast fails. In light mode it's worse: [data-theme="light"] .text-slate-600 → #94a3b8 (2957) ≈2.6:1 on white, applied to all 107 markup usages of text-slate-600.
- **Evidence:** Computed ratios: #64748b on #020617 = 4.24:1; #64748b on #0f172a = 3.75:1; #475569 on #020617 = 2.66:1; #94a3b8 on #ffffff = 2.57:1. Concrete small-text call sites: #liveRecap.is-empty 13px #475569 (821); .dash-thumb-empty 11px uppercase #475569 (3074); .dlb-empty 12.5px #64748b (3123) — the launchpad empty-state copy a brand-new user reads first; .jf-desc 11px #64748b (1036); .jd-cz-note 9.5px #64748b (3388).
- **Recommendation:** Set a floor: any text <18px on dark surfaces uses #94a3b8 minimum (7:1 on #020617); reserve #64748b for ≥18px or disabled. In light mode remap text-slate-600 to #64748b (4.7:1 on white) instead of #94a3b8, and text-slate-700 (→#b6bdc9, 1.9:1, line 2958) only for genuinely decorative glyphs. Easiest done via the DS-1 semantic tokens (--color-text-3 = the floor).
- **Principle:** spacing-type-color.md §4 — body text 4.5:1 non-negotiable; 'tertiary is the FLOOR'; mobile sunlight rationale stated verbatim in the doctrine
- **Breakage risk:** Visual hierarchy flattens slightly (tertiary text brightens); re-run theme-parity since both themes' maps change; screenshots of dashboard/launchpad will differ.

### DS-2 — user-scalable=no blocks text-size adaptation (WCAG 1.4.4) and papers over sub-16px inputs
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** index.html line 5 (viewport meta)
- **Problem:** The viewport meta declares user-scalable=no. Browsers that honor it (Android WebView/Chrome without force-zoom, older iOS) deny pinch-zoom entirely — on an app whose users are field contractors reading 9–11px micro-labels in daylight, often with presbyopia. It also currently suppresses iOS auto-zoom on the sub-16px inputs (DS-3), so removing it naively will surface that second bug.
- **Evidence:** Line 5: <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no" />. Paired hazard: .sgd-cell input 13px (1097), .sgd-sel 12px (1087), .margin-pill input inherits 14px (206–234), auth inputs text-sm/14px (5155–5158).
- **Recommendation:** Remove user-scalable=no (keep viewport-fit=cover). Ship together with DS-3 (16px input floor) so iOS focus auto-zoom doesn't start firing. Verify the landing scroll theatrics still behave with pinch enabled.
- **Principle:** WCAG 1.4.4 Resize Text (spacing-type-color.md §3 accessibility caveat); NN-g mobile legibility
- **Breakage risk:** iOS Safari will auto-zoom any remaining <16px input on focus (rail door dims, margin pill, auth form) — that is why DS-3 must land in the same change; pinch-zoom may fight the landing page's scroll-driven anchor animation.

### DS-10 — Auth form uses placeholder-as-label with ~2.5:1 placeholders — the first form of the first-login journey
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** index.html 5150–5162 (authScreen form); placeholder tokens 802–805, 1116, 2873
- **Problem:** Email and Password have no visible labels — only placeholder text styled placeholder:text-slate-600 (#475569 on the near-black .control surface ≈2.5:1). Once the user types, field identity vanishes; autofill review, error recovery, and screen-reader labeling all degrade. This is the very first interactive surface of the signup→first-job journey, and it contradicts the app's own label pattern (.rail-field > label 517, .sg-label 1613, .set-label 2460).
- **Evidence:** 5155: <input id="authEmail" … placeholder="Email" class="control … text-sm … placeholder:text-slate-600" /> — no <label> element; same for authPassword (5158). 14px input size also triggers DS-3. Placeholder color #475569 composited on rgba(15,23,42,0.6)-over-#020617 ≈ 2.5:1.
- **Recommendation:** Add small always-visible labels above each field using the existing .sg-label/.set-label token (12px/600/#cbd5e1), bump inputs to 16px, and raise placeholder color to the #94a3b8 token already used by .sg-input::placeholder (1621). Card grows ~40px — trivially affordable in a max-w-sm modal.
- **Principle:** NN-g 'Placeholders in form fields are harmful'; WCAG 3.3.2 Labels or Instructions; components doctrine — label+input gap 8px
- **Breakage risk:** Auth modal height increases (verify at 320px width); magic-link/recovery variants of the same form (5139–5227) must get the same treatment; light mode already forces placeholder #94a3b8 via 2873–2875 so parity is safe.

### DS-6 — Focus-visible is inconsistent; deal-status <select> removes outline with no replacement
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** index.html 586–591 (.job-status-sel), 131–201 (.dd-trigger/.dd-item), 744–758 (.rail-save-btn), vs. correct examples 2928, 3113, 1702
- **Problem:** Keyboard/switch users lose their place: .job-status-sel sets outline:none (590) with no :focus-visible substitute, so tabbing to the Lead/Quoted/Won/Lost select on job cards (markup at 10800, 12726, 13881) shows nothing. The custom dropdown .dd-trigger/.dd-item family defines hover/active/open states but no focus style. .rail-save-btn:focus-visible is only filter:brightness(1.06) (757) — an invisible indicator on the primary save action.
- **Evidence:** 590: '.job-status-sel { …cursor: pointer; outline: none; }' — no paired focus rule anywhere (grepped). .dd-trigger rules 131–159 cover hover/active/open only. Contrast with the system's own good pattern: .seg-btn:focus-visible { outline: 2px solid #c9a558 } (2928) and .dash-launch-card:focus-visible (3113).
- **Recommendation:** Add one global rule — :is(button,select,a,[tabindex]):focus-visible { outline:2px solid var(--gold-hi); outline-offset:2px } — then delete the scattered per-component copies and the bare outline:none declarations. Give .rail-save-btn a real ring.
- **Principle:** WCAG 2.4.7 Focus Visible; tokens doctrine — one focus token, referenced everywhere
- **Breakage risk:** Gold rings appear on mouse-click in browsers with imperfect :focus-visible heuristics inside custom dropdown JS (which may move focus programmatically); check the dd keyboard handlers before shipping; light mode needs a darker ring color (#97772e) per existing convention.

### DS-7 — Destructive and navigation touch targets far below the 24–44px floor (18–34px)
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** index.html 1088 (.sgd-remove 22px), 721 (.fb-thumb-x 18px), 1103 (.ef-remove 26px), 3108 (.dash-card-del 30px), 3243 (.nudge-x 32px), 3331 (.jd-fan-dot 7px), 3328 (.jd-fan-arrow 34px), 968 (.jf-iconbtn 34px)
- **Problem:** The smallest tap targets in the app are the destructive ones: removing a sliding-door row in the mobile rail is a 22×22 button; deleting a feedback photo is 18×18; deleting a job from the dashboard is 30×30. Fat-finger misses on a phone either fail silently or hit the adjacent control (the door-row selects sit 8px away). Carousel dots at 7px with 6px gaps fail even the 24px-or-spacing rule.
- **Evidence:** 1088: .sgd-remove { width:22px; height:22px; … font-size:17px }; 721: .fb-thumb-x { width:18px; height:18px; … }; 3108: .dash-card-del { width:30px; height:30px }; 3331: .jd-fan-dot { width:7px; height:7px } with gap:6px (3330). The codebase already owns the fix pattern: @media (pointer:coarse) bumps .edit-rate-btn to 40px and gives .info-tip a 40×34 pseudo-element hit area (1232–1238).
- **Recommendation:** Extend the existing pointer:coarse block: give every ≤34px control a 44px min hit area via padding or an ::before overlay (keep glyphs small); replace fan dots with a 44px-tall dot strip; .dash-card-del → 40×40 minimum.
- **Principle:** WCAG 2.5.8 (24px AA) / 2.5.5 (44px AAA); spacing-type-color.md §4 'don't ship to the 24px floor on a primary touch interface'
- **Breakage risk:** Row heights in the rail door editor and dashboard card footers grow a few px — verify the rail at 320px width and the dash card grid; no light-mode or resources impact.

### DS-3 — Inputs below the 16px iOS floor in the quoting path — the rule is codified elsewhere in the same file
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** index.html 1097 (.sgd-cell input 13px), 1087 (.sgd-sel 12px), 206–234 (.margin-pill input ≈14px), 5155/5158 (auth inputs 14px); correct: 2477, 2493, 1618, 3361
- **Problem:** Once DS-2 removes user-scalable=no, iOS Safari will auto-zoom the viewport every time a contractor taps a door width/height cell, the margin %, or the auth fields — a disorienting jump-zoom in the middle of pricing a job. The system already knows the rule: .set-field inputs, #settingsSearch, .sg-input, and .jd-recon-input are all deliberately 16px with comments saying why (2476, 2492).
- **Evidence:** 1097: .sgd-cell input { …font-size: 13px; }; 1087: .sgd-sel { …font-size: 12px; }; .margin-pill { font-size:14px } with input { font: inherit } (211/230). Comment at 2476: 'settings inputs ride >=16px to stop iOS zoom-on-focus' — the rule exists, applied to ~half the inputs.
- **Recommendation:** Make it a token: input, select, textarea { font-size: max(16px, 1em) } once globally, then remove the per-component 12–14px input sizes; visually compensate in the tight door-dims row by shrinking padding, not font.
- **Principle:** Mobile-forms doctrine / spacing-type-color.md §3 — 16px body minimum; iOS zoom threshold
- **Breakage risk:** The .sgd-dims row (1090) is width-budgeted for 13px text — three cells + remove button must still fit a 19rem rail at 320px; re-run theme-parity only if colors are touched (they aren't).

### DS-9 — Z-index is 20+ magic numbers; the documented 'toast above everything' invariant is already violated by the lightbox
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** index.html 1330–1334 (toast z-95 + comment), 3336 (#jdgLightbox z-120), screens 4328–7360 (z-[70]..z-[90]), components 160–2588 (z 20/21/28/29/30/35/40/45/46/60/80)
- **Problem:** Stacking order lives in scattered comments ('dashboard 74, legal 80, auth 90, Settings 79' at 1331; 'z-[79]: FL Lookup…' at 7262) rather than a scale. The toast comment promises it sits 'Above every overlay' at z-95, but the photo lightbox is z-120 — any toast fired while it's open (e.g. the offline/cloud-write failure toasts) renders invisibly behind the photo backdrop. Every new overlay requires archaeology to pick a number, and the next collision is a matter of time.
- **Evidence:** 1330–1333: '/* Above every overlay (dashboard 74, legal 80, auth 90, Settings 79)… */ z-index: 95;' vs 3336: '#jdgLightbox { position: fixed; inset: 0; z-index: 120; …}'. Inline screen values confirmed at 4328 (bootSplash 95 — also tied with toast), 4340 (landing 75), 5139 (auth 90), 6438 (admin 79), 7360 (pdfPreview 81).
- **Recommendation:** Define a tokenized ladder in :root (--z-rail:30; --z-total-bar:35; --z-popover:45; --z-screen:70; --z-modal:80; --z-auth:90; --z-lightbox:120; --z-toast:130) and migrate; minimally, bump .toast/.sign-alert above 120 today.
- **Principle:** tokens-theming.md — name by intent, one source of truth; 'magic numbers are the tell of an undisciplined UI'
- **Breakage risk:** Stacking regressions in rarely-exercised combinations (settings-over-pricing, pdf-preview-over-FL-modal) — test the overlay matrix in both themes; the inline Tailwind z-[NN] classes on screens must move in the same commit as the CSS ones.

### DS-13 — Light-mode substring selectors ([class*="bg-slate-800/"]) also match hover: variants, killing hover states and forcing wrong resting colors
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** index.html 2966–2979 (bg substring maps), 2972–2975 (border substring maps), 2978 (.bg-slate-100 inversion), 2958 (.text-slate-700 → #b6bdc9)
- **Problem:** The light theme remaps utilities via attribute-substring selectors: [class*="bg-slate-800/"] { background:#f4f6f9 !important }. But class="hover:bg-slate-800/60" CONTAINS that substring, so the override applies at rest and, being !important, also defeats the hover rule — elements lose their hover feedback and gain an unintended resting fill in light mode. Meanwhile .bg-slate-100 → #0f172a (2978) inverts a light utility to near-black, so any future legitimate light-surface use silently renders dark, and .text-slate-700 → #b6bdc9 is 1.9:1 on white.
- **Evidence:** 2966–2969: '[data-theme="light"] [class*="bg-slate-900/"], …[class*="bg-slate-800/"], …[class*="bg-slate-700/"] { background-color: #f4f6f9 !important; }' — substring matching semantics of [class*=] include variant-prefixed classes. 2978: '[data-theme="light"] .bg-slate-100 { background-color: #0f172a !important; }' with the pairing rule 2979 only fixing text when .text-slate-950 co-occurs.
- **Recommendation:** Short-term: convert substring selectors to exact-class lists for the utilities actually used (grep-generated), and scope the .bg-slate-100 inversion to the specific Save-Job pill selector it was written for. Long-term: dissolved entirely by DS-1's semantic tokens.
- **Principle:** tokens-theming.md §6 — re-map, never invert; value-named overrides become lies when reused
- **Breakage risk:** Each tightened selector may re-expose an unpatched light-mode surface — run theme-parity across landing, dashboard, calculator, settings after the change; this is pure light-mode work, dark is untouched.

### DS-5 — No type scale: ~35 distinct font sizes, with 8–10.5px doing real work and one 'micro-label' role implemented ten different ways
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** index.html 539 (.ai-badge 8.5px), 1196 (.cmp-best-badge 8px), 598 (.rail-section-header 9px), 3379 (.jd-cz-group 9px), 3423 (.esign-audit-k 9px), 1096 (.sgd-cell span 9px), 587 (.job-status-sel 9.5px), 3162/3296/1022/302/3441 (micro-label variants)
- **Problem:** Font sizes form a continuum (8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16…) with no scale, and the recurring uppercase micro-label role ships in ~10 divergent recipes (9px/.24em gold at 598; 10px/.18em slate at 302; 10px/.14em at 3296; 9.5px/.13em at 3210; 10px/.22em at 1428…). At 8–9.5px with 800–900 weight and wide tracking, these labels are below even the iOS 11pt practical floor — hard to read outdoors, and they blur on low-DPI Android. The inconsistency also means every new panel invents its own label style.
- **Evidence:** CSS font-size tally (grep): 22×10px, 12×9px, 6×9.5px, 4×10.5px, 2×8px, 1×8.5px, plus half-step sizes 11.5/12.5/13.5/14.5 used 30+ times. Ten distinct micro-label implementations cited above, all semantically 'section eyebrow/key label'.
- **Recommendation:** Define type tokens (--text-2xs:11px floor, --text-xs:12px, --text-sm:13–14px, --text-base:16px, --text-lg:20px, --text-xl:25px) and ONE .micro-label class (11px/700/.12em + a color token); migrate the ten variants to it; ban sub-11px except legally-required fine print.
- **Principle:** spacing-type-color.md §3 — modular scale, role→token mapping, 'nothing freehand'; iOS practical floor ~11pt
- **Breakage risk:** Dense rows (esign audit grid, calib cells, rail section headers) grow slightly and may wrap at 320px; light-mode label color overrides (3652–3708) must be folded into the new class; screenshot-diff the dashboard.

### DS-8 — Gold accent is spent on everything — hovers, chevrons, headers, badges — so nothing is the hero
`severity: medium` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** index.html pervasive: 306 (mat-head hover), 598–599 (section headers), 929 (mfr hover), 973/986 (jf hovers), 1000/1002 (res summary), 3068 (dash-nav hover), 3075/3300 (empty-state hovers), 3195 (dash-back hover) — 296 uses of #c9a558 + 131 gold rgba()
- **Problem:** Doctrine reserves the one saturated accent for the single most important thing per screen (primary action, live total). Here gold marks nearly every hover, every chevron, every section header, every count badge, every link. On the results screen the selling price and Save action — the money moment of the first-job journey — compete with dozens of equally-gold accents, so the eye has no landing point and the UI reads busier than its layout actually is.
- **Evidence:** Grep: #c9a558 ×296, rgba(181,143,74…) ×131. Sampling: interactive-hover→gold appears in .mat-head:hover (306), .mfr-toggle-all:hover (929), .jf-iconbtn:hover (973), .jf-menu button:hover (986), .rail-feedback-link:hover (692), .dash-nav-btn:hover (3068), .dash-thumb:hover .dash-thumb-empty (3075), .cust-back:hover (2531), .learn-nav-toc:hover (3449) — i.e., the accent is the default hover for every component family.
- **Recommendation:** Write a two-tier accent rule into the semantic tokens: gold = primary CTA + live total + active/selected state only; hovers and chevrons move to a neutral step-up (slate-300 text / slate-500 border, matching .rail-reset-btn:hover 773). Section eyebrows keep gold only on the public quote page where it's brand voice.
- **Principle:** spacing-type-color.md §4 — 'reserve your one saturated accent for the single most important thing per screen; if three things are primary, none are'
- **Breakage risk:** Brand feel changes noticeably — get owner sign-off on one screen first (calculator results); every touched hover needs its light-mode twin updated (the #97772e hover overrides at 3492, 3662, 3707).

### DS-11 — Radius entropy: 15+ corner values with adjacent 9/10/11px variants and no concentric nesting
`severity: low` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** index.html 137 (dd 14px), 299 (mat-card 16px), 313 (buck-switch 11px), 781 (rail-lf 10px), 968 (jf-iconbtn 9px), 1084 (sgd-row 12px), 1102 (ef-row 10px), 2216 (plan card 22px), 2432 (set-tab 9px), 3111 (launch card 18px), 3456 (learn-card 18px)
- **Problem:** Corners are chosen per component: 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22px + pill all coexist, with 9/10/11 used on sibling controls in the same rail. Nested elements reuse the parent's radius (e.g. 14px pills inside 14–16px cards) so corner gaps pinch. Individually invisible, in aggregate it's why dense panels read slightly 'off' rather than crafted.
- **Evidence:** Distinct radius literals found across 100–3727 include 6px (.res-num 1001), 7px (.jd-cz-row 3381), 8px (.sgd-sel 1087), 9px (.jf-iconbtn 968, .set-tab 2432, .fb-thumb 718), 10px (.rail-lf-input-wrap 781), 11px (.buck-switch 313, .mfr-card 883), 12px (.sgd-row 1084), 14px (.dd-trigger 137), 16px (.mat-card 299), 18px (.dash-launch-card 3111), 20px (sheet 464), 22px (.lp-plan-card 2216).
- **Recommendation:** Adopt --radius-sm:8, --radius-md:12, --radius-lg:16, --radius-xl:20 + pill; map by role (inputs/chips sm, rows/buttons md, cards lg, sheets/modals xl); for nested children use inner = outer − padding, snapped to a step.
- **Principle:** visual-craft.md §2 — one radius scale by role; concentric nesting inner = outer − gap
- **Breakage risk:** Purely visual, but touches hundreds of rules — do it during the DS-1 token migration to avoid double churn; screenshot-diff both themes.

### DS-12 — Shadows are ~12 ad-hoc near-black washes (alpha .45–.8) instead of a 2–3 step ladder; dark mode should lean on the tonal ladder it already has
`severity: low` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** index.html 168 (dd-panel), 429 (mtotalBar), 484 (jobRail), 863 (ai-tip), 977 (jf-menu), 1345 (sign-alert), 2225 (featured plan), 2498 (set-search-results), 3177 (dash-tip)
- **Problem:** Every floating surface carries its own hand-rolled shadow (0 24px 48px -12px rgba(0,0,0,0.7); 0 14px 28px -10px …0.7; 0 16px 32px -12px …0.75; 22px 0 46px -26px …0.75), most single-layer at 45–80% alpha. On the near-black background shadows barely read anyway, so the heavy alphas just darken edges; depth is actually being conveyed by the (good) practice of lighter surfaces — but unsystematically.
- **Evidence:** Nine distinct shadow recipes at the cited lines; alphas 0.45–0.8 vs doctrine's 4–12% layered; the horizontal-offset rail shadow (484: '22px 0 46px -26px') breaks the single-light-source rule every other shadow follows (x=0).
- **Recommendation:** Define --shadow-1/2/3 (menus/popovers → 2, dialogs/sheets → 3) plus the existing surface-lightening as the primary dark-mode elevation cue; replace call sites mechanically. Light mode keeps its own softer trio (already partially done at 2838).
- **Principle:** visual-craft.md §1 — discrete elevation ladder, layered low-alpha shadows, tonal elevation in dark mode
- **Breakage risk:** Low — subtle visual change; popover legibility over busy content (dashboard charts) should be spot-checked in both themes.

### DS-14 — Custom dropdown panel (.dd-panel) has no max-height/scroll, unlike the app's other two popover lists
`severity: low` · `kind: flaw` · `effort: S` · `verdict: ADJUSTED`

- **Where:** index.html 160–183 (.dd-panel) vs 2495–2499 (.set-search-results max-height:320px) and 2584–2588 (.county-combo-list max-height:244px)
- **Problem:** The rail's custom dropdowns (manufacturer, county-adjacent pickers) render an absolutely-positioned panel with no max-height or overflow-y. A long option list (the manufacturer list grows as users add brands) extends past the bottom of the phone viewport with no way to scroll the panel itself — options become unreachable inside the fixed-height rail. The two newer popover lists in the same file cap and scroll correctly, so this is pattern drift, not a decision.
- **Evidence:** 160–183: .dd-panel { position:absolute; top:calc(100% + 8px); …padding:6px; } — no max-height, no overflow. Compare .set-search-results (2495): max-height:320px; overflow-y:auto; and .county-combo-list (2584): max-height:244px; overflow-y:auto.
- **Recommendation:** Add max-height: min(320px, 50svh); overflow-y: auto; overscroll-behavior: contain to .dd-panel (and keep the accordion overflow:visible escape hatch at 673 working by testing a long list inside an open rail accordion).
- **Principle:** Consistency/standards (NN-g heuristic #4) — same component role, same behavior; mobile-patterns popover sizing
- **Breakage risk:** The :has() overflow escape for accordions (673–674) interacts with panel scrolling — verify a 15-item manufacturer list in rail-tidy mode on a 667px-tall viewport, both themes.
- **Verifier adjustment:** Core defect real: .dd-panel (160-183) has no max-height/overflow-y while .set-search-results (2494-2496, 320px cap) and .county-combo-list (2584-2585, 244px cap) both cap and scroll; createDropdown JS (9705-9748) adds no height handling; the manufacturer list IS user-extensible (mfr editor → commitAdmin 19359-19362). Two corrections: (1) there is exactly ONE .dd instance in the app — ddManufacturer (markup 5650-5654, wired at 14426); 'county-adjacent pickers' is wrong, the county picker is the separate correctly-capped combo. (2) Options are not strictly unreachable: #jobRail is overflow-y:auto (487) and the open accordion flips to overflow:visible while a dd is open (673-674), so the abs-positioned panel extends the rail's scrollable area and the bottom of a long list can be reached by scrolling the rail itself — awkward (panel never scrolls independently, trigger scrolls out of view, dropdown stays open since only clicks close it) but not a dead end. Pattern-drift framing and low severity stand.

## Section: mobile-crosscutting

**Summary:** On-screen, the mobile calculator is genuinely well built for the first-job journey: the drawer-plus-FAB layout keeps inputs reachable, the sticky mtotal bar keeps the live price in the thumb zone with a proper live region, sheets rise from the bottom with safe-area padding, and a real touch-target pass (44px modal closes, coarse-pointer hit-area extensions) has clearly happened. But the app's interaction *mechanics* betray that surface: nothing in the signed-in app participates in browser history, so the single most-used mobile gesture — Back — ejects a contractor from the site mid-quote instead of closing the save sheet or returning to the dashboard, and the two screens that do use history (Legal/Learn) implement it backwards so Back reopens what you just closed. The feedback layer is equally fragile: every failure, including 'your job did not save', is a 1.6-second unlabeled toast that screen readers never hear. Modals have zero dialog semantics or focus management, errors and keyboards fight the user in the save flow (Enter commits half-filled jobs, autofill is disabled on the exact contact fields phones can fill), and pinch-zoom is disabled outright on Android. None of these derail a happy-path demo, which is likely why they persist — they derail the unhappy paths (bad signal, mis-tap, Back habit, assistive tech) that field contractors hit constantly. Fixing the history/overlay-stack layer (MOB-1/2/10), the toast contract (MOB-3), and the viewport meta (MOB-5) would close most of the gap at modest cost.

**Strengths (do not regress):**
- The mobile sticky live-total bar is the reference implementation the rest of the app should copy: 56px min target, safe-area-aware padding, prefers-reduced-motion handling, and a pre-mounted aria-live polite <output> with an SR-only prefix (CSS 424–454, markup 5819) — plus companion rules that lift the FAB and pad the drawer so nothing is covered (450–453). Do not regress this in any bottom-nav work.
- A deliberate touch-ergonomics pass already exists and must be preserved: .modal-close is a true 44×44 across all modals (1690–1704), @media (pointer:coarse) extends edit-rate buttons to 40px and info-tips to 40×34 via ::before overlays (1230–1238), and rail-tidy mode gives seg buttons 42px min-height on phones (623–624). New UI (like the PR's floor rows) just needs to be held to the same bar.
- The job-photos fan carousel (13084–13134) is a model custom gesture: visible prev/next buttons as the WCAG 2.5.1 single-pointer alternative, touch-action: pan-y (3304), vertical-intent detection that yields to page scroll (13125), pointer capture, and drag-vs-click suppression — exactly the gestures-touch.md contract.
- Input ergonomics fundamentals are consistently right: near-universal inputmode=decimal/numeric on numeric fields including the new repeating-floors editor (5638, 5675, 10046–10054), type=tel/email/search where appropriate, safe-area insets on every fixed element (399–400, 437, 465, 1810), dvh fallbacks on full-height views (1382–1383), and modals that move focus into their first field on open (15097, 17606).

### MOB-1 — Browser/OS Back exits the app from every core screen — no history integration for dashboard, calculator, settings, or modals
`severity: critical` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** openDashboard 10848–10866, openAdmin 16891–16908, openJobDetails 13727–13734, openSaveJobModal 15094–15096, openJobRail 18039–18043; the only history writers are pricing (22868), legal (14199), learn (14342); the only popstate close is pricing (22925–22927)
- **Problem:** Every signed-in surface is a fixed div toggled by classList — nothing pushes a history entry. On Android (and iOS edge-swipe), Back is the universal 'dismiss' gesture; a contractor who opens the Save Job sheet or Settings and presses Back is ejected from the site entirely, mid-first-quote. Back never closes a modal, never returns dashboard→calculator, never does anything except leave.
- **Evidence:** openDashboard (10848) and closeDashboard (10867–10870) only add/remove 'hidden'; openSaveJobModal (15094–15096) does modal.classList.remove('hidden')/add('flex'); grep of history.pushState shows entries only at 14199 (legal), 14342 (learn), 22868 (pricing), 14207/14349 (close-side pushes); the popstate listener at 22925 closes only pricingScreen. No pushState/popstate exists for dashboardScreen, adminModal, jobDetailsModal, saveJobModal, flModal, buckModal, readPlanModal, or the jobRail drawer.
- **Recommendation:** Add a tiny overlay-history layer: when any full-screen screen or modal opens, pushState({overlay:id}); a single popstate handler closes the top-most open overlay (reusing the existing close fns already listed in the Escape handler at 24720). Guard the public #/q/ #/sign/ routes and the Supabase token-hash scrubbing (23389–23394, 21619) so they bypass it.
- **Principle:** navigation-depth.md §2 'Back is sacred — never trap the user by swallowing Back'; mobile-patterns.md §4 'Back/gesture should dismiss' modals
- **Breakage risk:** Must not fight the existing pricing/legal/learn hash handlers or re-fire handleLegalHashRoute loops; must skip auth-callback hashes (access_token scrub at 23392) and Stripe ?checkout returns (22799). The working-draft autosave already limits data loss, so the risk is regression in those routes, not data.

### MOB-2 — Legal and Learn break the Back contract: Back doesn't close them, and closing them makes Back reopen them
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** closeLegal 14203–14209, handleLegalHashRoute 14224–14228, closeLearn 14345–14351, handleLearnHashRoute 14352–14356 (contrast pricing's popstate close at 22925–22927)
- **Problem:** Opening legal pushes #/terms (14199). Pressing browser Back pops the hash to '' — but hashchange only OPENS legal (14224–14227 has no close branch), so the screen stays visible over a URL that no longer says legal; a second Back exits the site. Closing via the X pushes ANOTHER forward entry (14207) instead of going back, so after closing, one Back press re-lands on #/terms and reopens the screen the user just dismissed. Learn (14345–14356) has the identical bug pair.
- **Evidence:** closeLegal: `history.pushState({}, '', pathname)` (14207) — a push, not history.back(); handleLegalHashRoute: `if (d) openLegal(d);` with no else-close (14224–14227). Pricing got this right: popstate at 22925 calls closePricing() when the hash leaves #/pricing.
- **Recommendation:** Mirror the pricing pattern: in the hashchange/popstate handler, close legal/learn when the hash no longer matches; in closeLegal/closeLearn, call history.back() when the current entry is one we pushed (track a flag), falling back to replaceState for direct-link entries.
- **Principle:** navigation-depth.md §2 'Back/Up = reverse-chronological, never a surprise jump; every override of Back reads as a bug'
- **Breakage risk:** Legal-doc switching inside the screen pushes one entry per doc (14198–14200) — a naive history.back() chain could need multiple presses; direct entries from Stripe/Google links (#/privacy as first entry) must not history.back() out of the site.

### MOB-3 — Errors are delivered only via a 1.6-second toast with no live region and no dismissal-free reading time
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** toast() 14703–14709, #toast element 7381, .toast CSS 1326–1335; error call sites 15221, 16325, 22000, 17366, 20090
- **Problem:** toast() hard-codes a 1600 ms display for every message. Real failures ride on it: the storage-full save error at 15221 is ~130 characters (needs 6–8 s to read), 'Saved locally — cloud sync failed' (22000), 'Couldn't create the signing link' (16325), and the plan-read partial-failure message at 20090 which includes a re-upload instruction. A contractor in the field gets a flash of text, misses it, and believes the job saved or the link sent. The div also has no role/aria-live (7381 is a bare div), so screen readers hear none of it, and pointer-events:none (1333) means it can't be held open.
- **Evidence:** `toast._t = setTimeout(() => t.classList.remove('show'), 1600);` (14708) — fixed duration; `<div id="toast" class="toast">Saved</div>` (7381) — no role=status/aria-live, unlike offlineIndicator (5451) which does it correctly.
- **Recommendation:** Add role='status' aria-live='polite' aria-atomic='true' to #toast (it is pre-mounted — the injection pattern already matches accessibility.md §4); scale duration with message length (~min 4 s, ~70 ms/char); give failures a distinct error variant that persists until tapped, or better, render save/e-sign failures inline in the modal that caused them.
- **Principle:** accessibility.md §4 live regions ('toasts are silent to screen readers unless announced'); ux-pitfalls: transient messaging must not carry critical/error content
- **Breakage risk:** 142 call sites share this one function — a persistent-error variant must not make routine 'Saved' toasts sticky; light-mode toast override exists and any new error styling needs a [data-theme=light] pair + resources-sync if wording changes.

### MOB-4 — No modal has dialog semantics, focus trapping, or focus return — Tab walks out of every sheet into the page behind
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** All modals: saveJobModal 6244, flModal 7264, jobDetailsModal 6369, adminModal 6438, compareModal 6416; tvDismiss 11652–11673; grep for role="dialog"/aria-modal/inert returns zero hits
- **Problem:** Every overlay is a plain div. There is no role='dialog', no aria-modal, no inert on the background, no focus trap, and tvDismiss never returns focus to the trigger. A keyboard or screen-reader user who opens Save Job can Tab straight out into the calculator behind the scrim; on close, focus lands on <body>. SR users are never told a dialog opened (the modals do move focus into a field — 15097, 17606 — which helps sighted keyboard users only).
- **Evidence:** grep -n 'aria-modal|role="dialog"|inert|trapFocus' over the whole file returns nothing; tvDismiss (11652–11673) only removes classes and runs onDone — no document.activeElement save/restore anywhere in the open/close paths.
- **Recommendation:** One shared openModal/closeModal helper: set role='dialog' aria-modal='true' + aria-labelledby on the card, mark #appBody/#dashboardScreen inert while open, wrap Tab/Shift+Tab, save activeElement on open and restore in tvDismiss's finish(). The centralized tvDismiss and the single Escape handler (24720) make this a contained change.
- **Principle:** accessibility.md §2 focus management + §3 Dialog (Modal) APG contract; mobile-patterns.md §4 a11y contract for sheets
- **Breakage risk:** inert on the background must exclude #toast (z-95) and the sign-alert; focus-restore could fight the existing setTimeout(...).focus() calls (15097, 17606, 14700) — sequence them; stacked saveConflictModal (z-70) over saveJobModal needs top-most-only trapping.

### MOB-5 — user-scalable=no disables pinch-zoom — hard WCAG 1.4.4 failure on Android
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Line 5: <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no" />
- **Problem:** Android Chrome honors user-scalable=no, so low-vision contractors cannot magnify the dense breakdown table, 11px labels, or 10px uppercase micro-copy anywhere in the app. iOS ignores it, which hides the problem from iPhone-based testing.
- **Evidence:** The viewport meta at line 5 includes user-scalable=no; meanwhile the app's smallest persistent text is 9.5–11px (.pfp-label 2633, .mtotal-cap 442, tip text 1729).
- **Recommendation:** Remove user-scalable=no (keep viewport-fit=cover). To keep taps fast without it, add `button, a, [role=button], .btn { touch-action: manipulation; }` — the codebase currently has no manipulation rule at all (only touch-action:none on the signature pad 1627 and pan-y on the photo fan 3304).
- **Principle:** gestures-touch.md §2 ('don't disable page zoom globally') and WCAG 1.4.4 Resize Text; accessibility.md reflow criteria
- **Breakage risk:** Double-tap-zoom returns on elements without touch-action:manipulation — add the blanket rule in the same commit; verify the signature canvas (#/sign flow) still pins zoom locally via its existing touch-action:none.

### MOB-6 — Enter in the Save Job customer field commits the save instantly — mobile Return key saves a half-filled job
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** 24117 (keydown handler), saveJobModal fields 6265–6308, confirmSaveJob 15106+
- **Problem:** The Save Job sheet is a div (not a form) with seven fields, and only the first field has a key handler: Enter on 'Customer' fires confirmSaveJob() immediately. On a phone keyboard, Return is habitually 'next field' — a user types the customer name, taps Return to move to Job name, and the sheet saves and closes with address/phone/email empty. There is no enterkeyhint anywhere in the file to signal otherwise.
- **Evidence:** `document.getElementById("saveJobName").addEventListener("keydown", e => { if (e.key === "Enter") confirmSaveJob(); });` (24117); grep 'enterkeyhint' returns zero hits; the modal markup at 6244–6315 has no <form>.
- **Recommendation:** Wrap the fields in a <form> whose submit is the Save button; on intermediate fields set enterkeyhint='next' and advance focus on Enter; keep instant-save only from the last field or via the button. Job details editing (saveJobDetailsEdits) already proves silent-save patterns exist to reuse.
- **Principle:** forms-and-inputs doctrine: Enter must match the keyboard's advertised action; mobile-patterns.md §7 one-decision-per-step in commit flows
- **Breakage risk:** Desktop users may rely on quick Enter-to-save from the name field; preserve Ctrl/Cmd+S (isOnCalculator gate at 14715 excludes open modals — verify the shortcut path). Resave/overwrite conflict flow (saveConflictModal) must still trigger identically.

### MOB-7 — Sub-44px touch targets survive in high-frequency spots — including the only delete control in the new repeating-floors editor
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** .ef-remove 26×26px (1103, rendered at 10043); railToggleHeader ≈32px (5425); pfpBtn 36×36 (5459); .pfp-item rows ≈32px (2623–2629); demoBannerDismiss ≈20px (5831–5832); setup-wizard buttons 5075–5076, 5117, 5131–5132 (~32–36px)
- **Problem:** The codebase already has a deliberate coarse-pointer pass (1230–1238 pads edit-rate-btn to 40px and info-tips to 40×34; .modal-close is a true 44×44 at 1690–1704), but the new PR's floor-row remove button is 26×26 with no padding extension, the drawer toggle that opens the entire mobile input surface is ~32px in the top-left corner, and the avatar that gates ALL mobile navigation is 36px with ~32px menu rows beneath it. These are the most-tapped controls on a phone.
- **Evidence:** `.ef-remove { width: 26px; height: 26px; }` (1103); railToggleHeader `p-1.5` + 20px svg (5425–5429); `pfpBtn ... w-9 h-9` (5459); `.pfp-item { padding: 8px 12px; font-size: 13px; }` (2626); the @media (pointer:coarse) block (1232–1238) covers only .edit-rate-btn and .info-tip.
- **Recommendation:** Extend the existing coarse-pointer block: min 44px hit areas via padding or ::before overlays for .ef-remove, #railToggleHeader, #pfpBtn, .pfp-item (min-height 44px), the demo-banner ×, and the setup-wizard footer buttons (Back/Next already sit in the thumb zone — just add min-h-[44px] like Skip at 5129 has).
- **Principle:** mobile-patterns.md §2 (44×44 iOS / 48dp Material floor; 'extend the hit area with padding, not visible size')
- **Breakage risk:** pfpMenu grows taller (it scrolls — 5465 — so safe); rail header row height shifts; run theme-parity since several of these have light-mode overrides (3031–3032 ef-remove, 2882 pfp-item).

### MOB-8 — All mobile navigation hides behind the avatar menu in the top-right hard-reach corner
`severity: medium` · `kind: improvement` · `effort: L` · `verdict: CONFIRMED`

- **Where:** Header buttons `hidden sm:inline-flex` 5439–5450 (FL Lookup, Rates & Pricing, Dashboard); pfpMenu 5465–5539 (12+ items mixing Navigate/Plan/Settings/Admin)
- **Problem:** Below 640px the three header destinations vanish, leaving the 36px avatar (top-right, red thumb zone) as the sole gateway to Dashboard, Calculator, FL Lookup, Settings, My Plan and Sign out — a hamburger-in-disguise. First-time phone users on the calculator have no visible route back to the dashboard except the logo (unlabeled) or that menu; NN/g measured ~20% discoverability loss for hidden navigation.
- **Evidence:** 5439: `class="hidden sm:inline-flex ..."` on headerFLLookupBtn, repeated at 5443 and 5447; pfpMenu (5465) is a fixed 240px dropdown with ~32px rows; mobile's only other persistent controls are the Job-specs FAB (397) and mtotalBar (424) — both calculator-scoped.
- **Recommendation:** Give phones 2–3 visible top-level destinations: either compact icon-only header buttons (Dashboard, FL) with aria-labels, or a slim bottom tab strip (Dashboard / Calculator / Jobs) that coexists with mtotalBar by stacking above it only outside the calculator. Keep billing/admin/theme in the avatar menu.
- **Principle:** mobile-patterns.md §3 navigation hierarchy ('visible bottom tab bar best default; hamburger last resort — ~20% discoverability drop')
- **Breakage risk:** Bottom-strip collides with mtotalBar/FAB z-order and safe-area math (450–453); every new visible surface needs light-mode overrides and a resources-sync pass; dashboard cards already link to calculator so avoid duplicate affordances.

### MOB-9 — Bottom sheets ship a grab-handle affordance that doesn't work, and the page behind keeps scrolling
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** sheet-on-mobile CSS 456–477 (handle ::before 470–474); no body scroll lock anywhere (grep body.style.overflow / overflow-hidden toggles: none for modals); #jobRail drawer 479–490 also lacks overscroll-behavior
- **Problem:** The four converted sheets (readPlan 6163, buck 6193, saveJob 6244, fl 7264) draw a 40×4px grab handle — a strong signifier for swipe-to-dismiss — but the conversion is CSS-only: dragging the handle does nothing, and there's no Back-button dismissal (MOB-1). Meanwhile the sheet card gets overscroll-behavior:contain (467), but the scrim doesn't scroll, so a touch-drag on the exposed top area scrolls the calculator underneath; users close the sheet to find the page somewhere else. Same chaining applies to the jobRail drawer (overflow-y:auto, no containment, 487).
- **Evidence:** `.sheet-on-mobile > .card::before { ... width: 40px; height: 4px; ... }` (470–473) with a comment admitting 'CSS-only — no change to open/close logic' (458); no scroll-lock code exists (body.classList grep at 10134/18042 shows only mtotal-on and rail-open).
- **Recommendation:** Cheapest honest fix: lock body scroll while any overlay is open (position:fixed body technique with scroll restore) and add overscroll-behavior:contain to #jobRail; then either wire a real drag-to-dismiss from the handle (pointer events, commit on release past threshold, snap back otherwise) or restyle the handle as a plain top border so it stops promising a gesture.
- **Principle:** mobile-patterns.md §4 ('support swipe-down + Back dismissal'); gestures-touch.md §3 (false affordances) and §5 (overscroll-behavior on sheets/drawers)
- **Breakage risk:** iOS body-lock can jump scroll position — save/restore scrollY; drag-to-dismiss must not fight the sheet's internal scroll (only allow when card scrollTop=0, per gestures-touch §4 nested-scroller rule); reduced-motion path (477) must stay.

### MOB-10 — Escape closes nine overlays but not Job Details, Upsell, customer modals, or the PDF preview
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** Global Escape handler 24719–24721; jobDetailsModal close wiring 13693–13694/13967; upsellModal 6379; custStatsModal 6354; saveConflictModal 6319; pdf preview overlay 7361
- **Problem:** The single Escape handler enumerates closePfpMenu/closeAuth/closeAdmin/closeFL/closeJobRail/closeComparison/closeSaveJobModal/closeReadPlanModal/closeBuckModal — Job Details (the busiest dashboard modal), the upsell modal, customer stats/manage, save-conflict, and the PDF preview are absent. Users learn Esc works, then it randomly doesn't; keyboard users must hunt the × instead.
- **Evidence:** 24720 lists exactly nine closers; closeJobDetails exists (13735–13738) but is only bound to backdrop click (13694) and the rendered × (13967). The gallery lightbox separately handles its own Escape (13183), proving the intent exists but isn't centralized.
- **Recommendation:** Replace the hardcoded list with a small stack of open overlays (also needed for MOB-1 and MOB-4): Escape pops the top-most only. Interim fix: append the five missing closers, ordered so stacked children (saveConflict over saveJob, lightbox over jobDetails) close before parents.
- **Principle:** accessibility.md §3 Dialog pattern ('Escape closes'); mobile-patterns.md §4 universal modal rules — one consistent way out
- **Breakage risk:** Naively appending closers makes one Escape close a child AND its parent in the same keypress (e.g., conflict dialog + save modal, losing form input) — must be top-most-only.

### MOB-11 — Sign-in shows a wordless pulsing logo for the entire cloud sync, with no timeout or progress
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED`

- **Where:** bootSplash 4328–4335; boot() awaits enterApp() before openDashboard (23421–23425); enterApp awaits syncFromCloud (23438–23444); syncFromCloud is 3+ serial round-trips (21857–21901: getUser → profiles → jobs, then draft reconcile)
- **Problem:** On every app open a signed-in user stares at an unlabeled pulsing anchor while auth + profile + jobs fetches run serially. On field LTE that's easily 3–10+ s with zero words; if a request hangs there is no timeout, so the splash is indefinite and the app looks dead. Failure is only reported by a 1.6 s toast ('Offline — using local data', 23443) that can vanish before the dashboard paints.
- **Evidence:** bootSplash markup is one animated SVG, no text (4328–4335); no Promise.race/timeout wraps syncFromCloud in enterApp (23438–23444); the toast at 23443 uses the fixed 1600 ms duration (14708).
- **Recommendation:** Add a caption under the logo ('Syncing your jobs…') that appears after ~1 s; race syncFromCloud against an 8–10 s timeout that falls back to local data with a persistent offline banner (offlineIndicator 5451 already exists — trigger it); optionally paint the dashboard immediately from localStorage and reconcile in the background since loadJobs() is local anyway.
- **Principle:** states-and-feedback / ux-pitfalls latency limits (1 s = keep flow, 10 s = needs progress + escape hatch); NN/g response-time rules cited in navigation-depth cross-refs
- **Breakage risk:** Painting the dashboard before sync completes risks showing pre-sync jobs that reconcileDrafts then rewrites (the B3/B13 invariants at 21867–21915) — if going optimistic, re-render after sync; splash caption needs light-mode color.

### MOB-12 — Segmented controls are announced as tabs and have no arrow-key or roving-tabindex behavior
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** createSegmented 9677–9703; instances segConstructionType 5630, segHouseType 5633 (role="tablist"), buttons rendered with role="tab" aria-selected (9683)
- **Problem:** Construction/House pickers — the highest-impact price levers — are value selectors, not panel switchers, yet they're marked tablist/tab. Screen readers announce 'tab 1 of 3' and expect a tabpanel that never comes; keyboard users get every option as a separate Tab stop with no Left/Right movement because createSegmented wires click only (9694–9698).
- **Evidence:** `<button class="seg-btn ..." role="tab" aria-selected=...>` (9683); the only listener is root.addEventListener('click', ...) (9694); no keydown handling or tabindex management exists in the function.
- **Recommendation:** Switch to the APG radiogroup contract in createSegmented (one function fixes every instance): role='radiogroup' on root, role='radio' + aria-checked on buttons, roving tabindex (active=0, rest=-1), ArrowLeft/Right to move+select. Update the two hardcoded role='tablist' attributes at 5630/5633.
- **Principle:** accessibility.md §3 Segmented control = Radio Group APG ('do not conflate with Tabs'); mobile-patterns.md §5
- **Breakage risk:** SEGMENTS[].setValue API and data-value strings are untouched, so STATE/saved jobs/AI-fill (24673) are safe; verify no CSS keys off [role=tab].

### MOB-13 — Save Job contact fields set autocomplete="off", blocking mobile autofill and WCAG input-purpose
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: ADJUSTED`

- **Where:** saveJobName 6267, saveJobAddress 6282, saveJobPhone 6288, saveJobEmail 6293 (contrast saveJobCompany 6272 which correctly uses autocomplete="organization")
- **Problem:** Phone/email/address/name — the exact fields mobile keyboards can autofill from contacts — are autocomplete='off', so contractors retype customer details on a phone keyboard for every job. It also fails WCAG 1.3.5 Identify Input Purpose (AA). The right types (tel/email) are already set, so the keyboards are correct but the fill assist is disabled.
- **Evidence:** 6288: `type="tel" placeholder="(555) 123-4567" autocomplete="off"`; 6293: `type="email" ... autocomplete="off"`; company at 6272 shows the team knows the attribute.
- **Recommendation:** Set autocomplete='name', 'street-address', 'tel', 'email' respectively (and 'email' on recEmail is already right at 5195). Combined with MOB-6's <form> wrapper, browsers will offer one-tap contact fill.
- **Principle:** accessibility.md §1 (3.3.7 Redundant Entry / smart-defaults ethos); WCAG 1.3.5; forms-and-inputs autofill guidance
- **Breakage risk:** -webkit-autofill yellow/white fill can break the dark control styling — add the autofill box-shadow override in both themes (theme-parity run required).
- **Verifier adjustment:** Code evidence is fully correct: saveJobName 6267, saveJobAddress 6282, saveJobPhone 6288 (type=tel), saveJobEmail 6293 (type=email) all set autocomplete="off" while saveJobCompany 6272 uses autocomplete="organization"; blocked contact autofill on mobile is real. Correction: the WCAG 1.3.5 (Identify Input Purpose) citation doesn't strictly apply — that SC covers only fields collecting information ABOUT THE USER, and these fields collect the CUSTOMER's (a third party's) name/address/phone/email, so it's a UX/autofill defect, not an AA conformance failure. (Ironically the one field with a token, saveJobCompany, is also third-party data.)

### MOB-14 — Auth form uses placeholder-as-label throughout
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** authEmail 5154–5155, authPassword 5157–5158, authConfirm 5168–5169, recEmail 5195–5196
- **Problem:** Email/Password/Confirm have no visible labels — only placeholders that vanish on input. On a phone, autofill or a stray keystroke leaves three identical gold-ringed boxes with no way to tell password from confirm without clearing them; SRs get lucky (placeholder is announced) but WCAG treats this as a labeling failure, and the pattern is called out in the brief's a11y list. Sign-up asks for a second password field, doubling the confusion.
- **Evidence:** 5154: `<input id="authEmail" type="email" autocomplete="email" placeholder="Email" ...>` — no <label> or aria-label; same for 5157, 5168. Save Job (6266) and the setup wizard (5087) use real labels, so this screen is the outlier.
- **Recommendation:** Add small persistent labels above each field (matching the Save Job label style at 6266) or a float-label treatment; keep placeholders as examples only. Bonus: the pw-toggle at 5159 is tabindex="-1" — keep it but confirm the 44px coarse hit-area (currently p-1.5 ≈ 29px).
- **Principle:** forms-and-inputs / accessibility: placeholder is not a label (NN/g); brief's explicit a11y failure list
- **Breakage risk:** Auth card height grows ~60px — verify it still fits small phones with the keyboard open (authScreen has no overflow-y:auto at 5139, so added height increases the clipping risk; add overflow-y:auto while in there). Light-mode label colors needed.

### MOB-15 — No deep links or state restoration inside the signed-in app; desktop loses the live total on scroll
`severity: low` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED`

- **Where:** Dashboard reset on every open: _dashView='home' + scrollTop=0 (10858–10859); no #/dashboard, #/settings, #/job/<id> routes (boot 23335–23436 handles only #/q, #/sign, #/pricing, legal, learn); desktop-persistent total: #mtotalBar and #jobSummaryBar are <1024px-only (394, 447) while #sellingPrice (5862) scrolls away above the breakdown table
- **Problem:** Refresh anywhere in the app lands you on the dashboard launchpad, top-scrolled — a contractor reviewing the Shopping or Calibration drill-in who rotates the phone or gets a tab reload loses their place entirely; nothing but pricing/legal/learn survives the share test. Separately, desktop (≥1024px) has no persistent price: editing rates in the pinned rail while scrolled into the Labor Detail section gives no visible total feedback, the very thing mtotalBar solves on mobile.
- **Evidence:** openDashboard always sets `_dashView = "home"` and `d.scrollTop = 0` (10858–10859); `@media (min-width: 1024px) { #mtotalBar { display: none !important; } }` (447); the price lives only at the top of #results (5860–5866).
- **Recommendation:** Adopt replaceState-based hashes for app views (#/dash/shopping, #/settings/rates via the existing showSettingsTab names, #/job/<id>) so refresh/rotation restores the view — pairs naturally with MOB-1's popstate layer. For desktop, show a compact selling-price chip in the sticky appHeader (5422) once #results is scrolled past, reusing the mtotalOut live-region pattern.
- **Principle:** navigation-depth.md §3 'URL as state — the share test' and §4 scroll restoration; components/mobile-patterns §7 sticky live total
- **Breakage risk:** New hashes must be excluded from the public-route gate (23339–23346) and auth-hash scrub; header chip needs light-mode styling and must not crowd the offline indicator/usage badge; resources-sync if the guide documents navigation.

### MOB-16 — Account menu height uses 100vh — bottom items can hide under iOS toolbars
`severity: polish` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED`

- **Where:** pfpMenu inline style 5465: max-height: calc(100vh - 84px)
- **Problem:** On iOS Safari with the dynamic toolbar expanded, 100vh exceeds the visible viewport, so the menu's last items (Sign out) can render behind the toolbar; the menu scrolls, but users don't know content is cut off. The codebase already uses the dvh fallback pattern elsewhere (1382–1383, 1568).
- **Evidence:** 5465: `style="... max-height: calc(100vh - 84px); overflow-y: auto;"` vs the correct dual declaration `min-height: 100vh; min-height: 100dvh;` at 1382–1383.
- **Recommendation:** Change to `max-height: calc(100dvh - 84px)` with the 100vh line kept as fallback, matching the established pattern.
- **Principle:** mobile-patterns viewport guidance (dvh/svh over vh for chrome-affected heights); gestures-touch cross-ref
- **Breakage risk:** None meaningful — pure CSS; verify in both themes out of habit.

## Section: AI plan-reading flow (readPlanModal, extraction pipeline, AI-reads meter)

**Summary:** The AI plan reader is the app's headline differentiator ("AI reads your plan", landing 4485/4893) but in the first-job journey it is a quiet rail button: signed-in users land on a dashboard whose launchpad (DASH_CARDS 10898) has no AI card, and the feature surfaces only as an 11px "Upload Window Schedule" label at the top of the calculator rail (5601–5611) plus an empty-state text link (6140). The pipeline itself is impressively engineered for credit integrity (pre-flight checks, server refunds, cap-pinning), and the per-field gold "AI" badges with clear-on-edit semantics are a genuinely good trust pattern — but the feedback layer collapses at the exact moments trust is earned: a metered, minutes-long, multi-credit read starts straight from a file picker with zero cost disclosure, progress lives on a button hidden inside the mobile drawer, and every outcome (applied summary, credits used, partial-failure warning, page-cap notice) is fired into a single 1.6-second toast where each message overwrites the last. Worst of all, the partial-failure toast tells users to "re-upload those sheets to finish" when a fresh upload replaces the entire takeoff — following the app's own advice destroys the successful half of the read and double-spends credits. Extracted numbers become "the takeoff" with no per-opening review surface in the read flow and no persisted provenance, so after a reload an AI-guessed LF is indistinguishable from a measured one. The feature can win the first-priced-job journey in seconds when it works cleanly, but its partial-failure, cost-transparency, and feedback paths currently derail exactly the large commercial jobs it was built to win.

**Strengths (do not regress):**
- Per-field AI provenance markers are excellent trust design: markFieldAi/clearFieldAi (20109–20152) put a gold 'AI' pill + gold ring on every auto-filled rail field, with a focusable explainer popover ('Double-check it before you bid', 20124) and automatic clearing the moment the user edits — CSS has explicit light-mode overrides (559–564, 584). Later phases must not regress the clear-on-edit capture listener (20147–20152).
- Credit-integrity engineering protects users from silent charges: pre-flight zero-credit check before any work (19963–19968), chunk-aware pre-check that refuses to start a plan the user can't cover (20017–20026), local meter mirrored only for successful chunks with careful cap-pin logic that avoids locking users out of reads they paid for (20053–20075), and retry-on-transient that excludes cap/auth/too-large statuses (20038–20041).
- Read failures get a persistent error surface instead of a fleeting toast — showPlanError (19896–19913) reopens the modal with the message plus a copyable diagnostics blob for support, explicitly built because 'a fleeting toast vanished before users could read it'.
- The AI-reads meter is theme-safe and self-hiding: .aim tier colors have [data-theme=light] overrides (3631–3634) and .ai-reads-meter:empty{display:none} (527) prevents an empty shell when signed out.

### AIPLAN-1 — Partial-failure guidance ('re-upload those sheets') destroys the successful half of the takeoff and double-spends credits
`severity: critical` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Partial-failure toast at index.html:20090 vs applyFullExtraction replace semantics at 20154–20219
- **Problem:** When some chunks of a large plan fail, the user is told 'Re-upload those sheets to finish.' But every upload is a full replace: applyFullExtraction sets STATE.windowCount/totalLF from only the new upload's openings (20168–20177), replaces slidingDoors/bifoldDoors ('Replace any prior list — fresh upload supersedes', 20180–20187, 20198–20204), rebuilds buckList from the new openings only (20217), and clearAllAiFilled wipes the markers (20155). A contractor who obeys the toast wipes the 75 pages that read successfully, pays credits again for the re-read, and ends up bidding a fraction of the building.
- **Evidence:** 20090: toast(`Read ${okChunks} of ${chunks.length} sections — … Re-upload those sheets to finish.`); 20155: clearAllAiFilled(); 20172–20175: STATE.windowCount = String(count); STATE.totalLF = String(lf) — computed solely from parseOpenings(text) of the current upload; 20181 comment: 'Replace any prior list (fresh upload supersedes)'.
- **Recommendation:** Keep the failed chunk indexes in memory and offer a 'Retry failed pages (uses N reads)' action that re-invokes only those chunks and merges into the existing texts[] before re-running applyFullExtraction — or at minimum change the copy to 'Re-upload the whole plan' and warn that a new upload replaces the takeoff. A persistent banner (not a toast) should carry this state.
- **Principle:** States & Feedback §5 — errors must say how to recover, and the recovery path must actually work; Trust & Ethics §1 — a number someone will act on must not be silently incomplete.
- **Breakage risk:** Merging follow-up reads changes the 'fresh upload supersedes' invariant that sliders/bifolds/approvals rely on — must scope merge mode to the retry path only. Resources guide documents read behavior (resources-sync). New banner needs light-mode overrides (theme-parity).

### AIPLAN-2 — All read outcomes fight over one 1.6s toast — the applied summary and the incomplete-takeoff warning overwrite each other
`severity: critical` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** toast() at index.html:14703–14709; sequential calls at 20251 (Applied summary), 20088 (credits used), 20090 (partial failure), 20091 (page cap)
- **Problem:** toast() writes textContent into a single element and resets a 1600ms timer, so consecutive calls replace each other instantly. On every non-admin read the 'Applied: 12 windows · 340 LF · cut list' receipt (the comment at 20248 calls it 'the glance-check summary') is immediately replaced by the credits toast; on a partial failure that is in turn replaced, and if the plan was also over the page cap only the last message survives. The user can bid a high-rise with 25 pages of openings missing having never seen the warning — and never sees what the AI actually applied.
- **Evidence:** 14705–14708: t.textContent = msg; clearTimeout(toast._t); toast._t = setTimeout(…,1600). Call chain: applyFullExtraction toast at 20251 runs inside line 20078, then 20088 `${okChunks} AI read(s) used — ${rem} left`, then 20090 partial-failure, then 20091 truncation — all synchronous.
- **Recommendation:** Queue toasts (show sequentially, duration scaled to word count ~ min 2.5s), and promote partial-failure and truncation to a persistent dismissible banner near the results/rail. Move the credits line into the same applied-summary toast string.
- **Principle:** States & Feedback §4 — toasts must never carry information the user cannot afford to miss; one channel, one message at a time.
- **Breakage risk:** A toast queue affects every toast() call site (100+) — keep API identical. New warning banner needs [data-theme=light] styles (theme-parity).

### AIPLAN-3 — Metered credit spend starts with zero cost disclosure — the 1-read-per-25-pages rule is only revealed in a failure message
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Rail label→file picker at index.html:5605–5609 and change handler 24710–24713; chunk math at 20012–20026; meter placements 6183/6214
- **Problem:** The happy path is: tap 'Upload Window Schedule' → OS file picker → read begins and debits 1 credit per 25-page chunk. Nothing before or during the pick says the action is metered, how many reads the file will cost, or how many remain — the ai-reads-meter lives only inside buckModal and the error-only readPlanModal, and the 'This plan needs N AI reads' math (20022) only renders when the user can't afford it. A Starter user (2 reads/mo) can burn a month's quota on one 30-page upload and learn about it from a 1.6s toast that AIPLAN-2 overwrites.
- **Evidence:** 24708 comment: 'the <label for> opens the picker natively' — no modal, no confirm; 20014: const creditsNeeded = chunks.length; first user-visible mention of cost is the insufficient-credit error at 20022 or the post-hoc toast at 20088. renderAiReadsMeter callers: 19678 (error-only modal), 20873 (buck modal) only.
- **Recommendation:** After rendering pages (page count known at 20013), show a one-line confirm whenever creditsNeeded > 1 or remaining ≤ 2: 'This 60-page plan uses 3 of your 5 AI reads — Read it?'. Add aiReadsMeterHtml() under the rail button so the balance is visible before the pick.
- **Principle:** Trust & Ethics §2 — disclosure timing: every knowable mandatory cost must appear before commitment, never only at the end.
- **Breakage risk:** Extra step could annoy unlimited/admin users — skip confirm when cap is Infinity. Rail meter needs light-mode check (theme-parity); resources-sync (guide documents credit rules).

### AIPLAN-4 — Minutes-long parallel read has no visible progress on mobile, no aggregate progress anywhere, and no cancel
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** setRailUploadBusy at index.html:19878–19892; per-chunk setBusy at 20034–20036; kickoff toast 20027; rail-is-drawer comment 5585
- **Problem:** Progress for a read that the app itself says 'can take a few minutes' renders only as spinner+text swapped into the rail button — the rail is a drawer on mobile and collapsible on desktop, so in the common mobile case the only signal is a 1.6s kickoff toast, then silence for minutes. With 3 parallel workers each overwriting the same label ('Reading pages 26–50…' then '1–25…'), there is no cumulative 'X of N chunks done', no time estimate, no cancel, and no beforeunload guard while the server is debiting credits chunk by chunk.
- **Evidence:** 19884: lbl.innerHTML = spinner + msg (rail button only); 20034–20036: setBusy(`Reading pages ${startPage}–${endPage} of ${allImages.length}…`) called per worker, last-start wins; 20027: toast('…large plans can take a few minutes…') — 1600ms lifespan; no AbortController or cancel affordance anywhere in handlePlanUpload (19959–20101).
- **Recommendation:** Render a fixed-position progress pill/banner on the calculator stage (visible with rail closed): 'Reading your plan — 2 of 4 sections done', driven by okChunks+failChunks. Add a beforeunload warning while _planUploadBusy. Cancel can defer (server work already dispatched), but say so: 'Reads in progress can't be canceled.'
- **Principle:** States & Feedback §2 — waits >10s need determinate progress; a spinner past the attention limit reads as broken.
- **Breakage risk:** New fixed overlay must not block the results footer or collide with the toast; needs light-mode styles (theme-parity). Keep _planUploadBusy reset in finally intact.

### AIPLAN-5 — No review surface for what the AI read — aggregate numbers become 'the takeoff' sight-unseen
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** applyFullExtraction closes the flow at index.html:20245–20252; per-opening editor exists but only in buckModal (6218, renderBuckOpeningsEditor 20924)
- **Problem:** The read flow fills windowCount, totalLF, doors, manufacturer, and cut list, then closes the modal — the only receipt is the overwritten toast (AIPLAN-2). A per-opening list with editable dimension types already exists (buckOpeningsEditor) but is reachable only via the Buck Cut List modal from Job Files, and nothing after a read points there. If Grok misreads a QTY column (10 vs 1) or merges two schedule rows, the inflated LF flows straight into the live price with no way to spot it short of manually re-doing the takeoff. The AI badge says 'Double-check it' but offers nothing to check against.
- **Evidence:** 20250: if (source !== 'buck') closeReadPlanModal(); 20251: toast is the summary; 20176: markFieldAi('totalLF') — badge tooltip 20124 says 'Double-check it before you bid' with no link; openings list rendered only by renderBuckOpeningsEditor (20924–) inside buckModal (6218).
- **Recommendation:** After a successful read, surface 'Review the N openings AI read →' (persistent chip near the LF field or in the applied banner) that opens the existing openings editor. This reuses built UI — the gap is the pointer to it.
- **Principle:** Trust & Ethics §1 / principles.md 'good design is honest' — show the receipt behind a number the user will act on; progressive disclosure (detail on demand, but reachable).
- **Breakage risk:** Opening buckModal from the read flow must not disturb its 'stays open to show cut list' behavior (20248–20250); resources-sync for the guide's read-flow description.

### AIPLAN-6 — AI upload is keyboard-inoperable — all three triggers are non-focusable <label> elements wrapping display:none inputs
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Rail trigger index.html:5605–5609; readPlanModal trigger 6178–6181; buckModal trigger 6208–6212; only focusable path 6140 (empty-state button)
- **Problem:** 'Upload Window Schedule' (5606), 'Choose plan file' (6178, 6209) are <label for=…> styled as buttons: labels are not in the tab order, have no role or keydown handling, and the associated file inputs are class="hidden" (display:none — unfocusable). A keyboard or switch user cannot start an AI read at all once the empty state is gone; the one real <button> (emptyStateScanLink, 6140) disappears as soon as any value is entered.
- **Evidence:** 5605: <input id="readPlanFile" type="file" … class="hidden" />; 5606: <label for="readPlanFile" id="readFromPlanBtn" class="btn …"> — no tabindex/role; same pattern at 6178 and 6208–6212. 24708 comment confirms the label-native-click design.
- **Recommendation:** Make the inputs sr-only (position:absolute; clip) instead of display:none so they're focusable and label-styled via :focus-within, or add tabindex="0" role="button" + Enter/Space → input.click() on each label (guarding the double-fire noted at 24708).
- **Principle:** Accessibility doctrine — every operable control must be reachable and activatable by keyboard (WCAG 2.1.1).
- **Breakage risk:** sr-only inputs can double-open the picker if the label also forwards clicks — test click paths on iOS Safari; keep the _planUploadBusy guard. No visual change, so theme parity is unaffected.

### AIPLAN-7 — Catch-all error discards the real cause — offline CDN, unsupported image, or bad PDF all become 'Something went wrong — try again'
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** catch block index.html:20094–20095; specific errors thrown at 19784 (PDF.js CDN), 19831 (image decode), pdfToImages 19792–19814
- **Problem:** pdf.js is fetched from cdnjs at read time; on a job site with no signal the load fails with 'Couldn't load the PDF renderer' — but the catch replaces every thrown message with the generic 'Something went wrong — try again in a moment.', a suggestion that cannot work offline. Same for HEIC/webp picks that Image() can't decode ('Couldn't read image') and corrupt/password-protected PDFs. The user gets no clue whether to retry, convert the file, or find signal; landing copy promises 'Snap a photo' (4485) so phone-photo failure modes matter.
- **Evidence:** 20094–20095: } catch (err) { setErr("Something went wrong — try again in a moment."); } — err.message discarded; 19784: reject(new Error("Couldn't load the PDF renderer")); 19831: reject(new Error("Couldn't read image")).
- **Recommendation:** Surface err.message when it matches the app's own thrown strings, and add cause-specific copy: offline/CDN ('Couldn't load the PDF reader — check your connection'), unsupported type ('That photo format isn't supported — use JPEG/PNG or a PDF'), encrypted PDF. Consider capture="environment" as a secondary 'Take a photo' affordance.
- **Principle:** States & Feedback §5 — an error must say what failed and how to recover; never one generic string for distinct causes.
- **Breakage risk:** None significant; error strings appear in the persistent showPlanError surface, so keep them short. Resources guide lists supported formats (resources-sync).

### AIPLAN-8 — Upsell wall for exhausted AI reads shows a false consequence: 'Saving new quotes is paused'
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Static #upsellPhase2Note index.html:6406; ai_reads_exhausted copy 22548–22551; showUpsellModal 22577–22615 never updates the note
- **Problem:** showUpsellModal swaps eyebrow/headline/body per reason but the italic footer note is hardcoded in the HTML: 'Saving new quotes is paused until you upgrade or your billing cycle resets…'. When the reason is ai_reads_exhausted (fired at 19966, 20023, 20058) this is untrue — quote saving still works, only AI reads are spent. A user out of AI reads is told a scarier, wrong consequence, which both misleads and cheapens the wall's credibility for the real limit_reached case.
- **Evidence:** 6406: <p id="upsellPhase2Note" …>Saving new quotes is paused…</p>; 22586–22596 sets only upsellEyebrow/Headline/Body; no write to upsellPhase2Note anywhere (grep).
- **Recommendation:** Add a per-reason note to UPSELL_COPY (for ai_reads_exhausted: 'You can keep quoting and enter openings by hand — AI reads reset next cycle.') and set/hide #upsellPhase2Note in showUpsellModal.
- **Principle:** Trust & Ethics §6 — no false urgency/consequence framing at a paywall.
- **Breakage risk:** Verify the note still shows correct text for trial_expired / subscription_inactive / limit_reached reasons; resources-sync if the guide quotes the wall copy.

### AIPLAN-9 — 'Upgrade for more' in the exhausted meter is a dead affordance — underlined, cursor:pointer, no handler
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** aiReadsMeterHtml index.html:22315–22316; CSS .aim-cta at 533
- **Problem:** When reads hit zero the meter appends '· Upgrade for more' styled as a link (underline + pointer cursor), but no click handler exists anywhere for .aim-cta — clicking does nothing. This is the exact moment a motivated user tries to pay, and the CTA is inert; it also trains users that gold underlined text in this app may be fake.
- **Evidence:** 22315: const tail = remaining <= 0 ? ` · <span class="aim-cta">Upgrade for more</span>` : ""; 533: .aim-cta { text-decoration: underline; cursor: pointer; } — grep for aim-cta finds only these two sites, no listener.
- **Recommendation:** Delegate a click handler on .ai-reads-meter for .aim-cta → showUpsellModal('ai_reads_exhausted') (or route to the pricing screen), and make it a real <button> for keyboard users.
- **Principle:** UX pitfalls — false affordance: anything styled as interactive must respond (Norman, affordance/signifier match).
- **Breakage risk:** Meter renders in two modals — ensure the handler is bound once (delegation). None for themes (existing .aim light overrides at 3631–3634).

### AIPLAN-10 — AI-read balance has no persistent home — meter only appears in the buck modal and the error surface
`severity: medium` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** renderAiReadsMeter call sites index.html:19678 (error-only modal), 20873 (buckModal); Settings subscription panel 22625–22682 shows quotes only
- **Problem:** A metered resource the user pays for is invisible until they either open the Buck Cut List modal or fail a read: the readPlanModal that hosts the other meter (6183) is opened only by showPlanError since openReadPlanModal has no UI caller. The Settings → Subscription panel tracks quote usage with a progress bar (22650–22661) but says nothing about AI reads. Users cannot plan usage ('do I have enough reads for this bid?') without triggering the feature.
- **Evidence:** grep .ai-reads-meter → only 6183 and 6214; renderSubscriptionPanel usage math at 22650–22661 uses quotesUsedThisCycle/getPlanLimit() exclusively; getAiReadsUsed (22297) is rendered nowhere persistent.
- **Recommendation:** Add an 'AI plan reads' row with the same usage-bar treatment to the subscription panel, and drop aiReadsMeterHtml() under the rail's 'Upload Window Schedule' button (pairs with AIPLAN-3).
- **Principle:** Visibility of system status (NN/g heuristic #1) — quota state should be checkable, not only discoverable at the point of failure.
- **Breakage risk:** Subscription panel layout in light mode (theme-parity); resources-sync — the guide's 'where to see your reads' text.

### AIPLAN-11 — Pricing page sells reads-per-month without disclosing the 25-pages-per-read rule
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** FAQ index.html:4936–4939; pricing table row 4839; plan features 22174/22195; rule defined at 19924 and disclosed only in error copy 20022
- **Problem:** '2 a month on Starter, 100 on Pro' reads as two *plans* a month, but one 26-page plan costs 2 reads and a 51+-page plan is impossible on Starter — the 1-read-per-25-pages metering exists nowhere on the landing/pricing surface, only inside the insufficient-credit error message. A Starter buyer with commercial-size plans discovers post-purchase that their quota covers a fraction of what the FAQ implied. The trial FAQ also says 'includes a few' when the code grants exactly 5 (22291).
- **Evidence:** 4939: 'AI plan reads are included on every paid plan — 2 a month on Starter…'; 19921–19924: PLAN_CHUNK_SIZE = 25, 'one metered AI read each (≈ per 25 pages)'; 20022: the only user-facing statement of the rule; AI_READ_CAPS trial: 5 (22291).
- **Recommendation:** Add one clause to the FAQ answer and a footnote to the 4839 table row: 'One read covers up to 25 plan pages; larger plans use one read per 25 pages.' Replace 'a few' with '5'.
- **Principle:** Trust & Ethics §1/§2 — all-in disclosure of mandatory conditions before purchase; drip-disclosed limits are a deceptive-pattern class.
- **Breakage risk:** Copy only, but MUST run resources-sync (the Resources guide documents credit rules) and keep AI_READ_CAPS/edge-fn caps in lockstep per 22285–22287.

### AIPLAN-12 — AI provenance is DOM-only — badges vanish on reload/cross-device sync and never reach the saved job or PDF
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** markFieldAi index.html:20106–20128 (classes/DOM only); no aiFilled field in STATE (resetAll 14732–14768); draft cloud sync restores values without markers
- **Problem:** The gold 'AI — double-check it' markers are the feature's honesty mechanism, but they live purely in the DOM: nothing is written to STATE, the working draft, or the saved job. Reload the page (or open the synced draft on another device — one-per-account sync is a core feature) and the AI-guessed LF renders exactly like a hand-measured one; the intended 'reflects only un-reviewed values' semantics (comment 20107–20108) silently breaks, and neither job details nor the quote PDF ever records that a takeoff was AI-read.
- **Evidence:** 20113: field.classList.add("ai-filled") — the only persistence; STATE fields enumerated at 14734–14767 contain no AI flag; grep 'ai-filled' shows only CSS + these functions, no rehydration on load.
- **Recommendation:** Persist an aiFilled: {totalLF:true,…} map in STATE (cleared by the same edit listener), rehydrate badges on boot/draft-load, and consider a one-line 'Takeoff read from plan by AI' note in job details.
- **Principle:** Trust & Ethics — provenance of a number someone acts on must survive the session; consistency (same state ⇒ same signifier).
- **Breakage risk:** HIGH data-model care: STATE-rebuild fns (writeDraftJob/confirmSaveJob/saveAsNewVersion) silently drop fields not carried forward (known project pitfall) — the new key must be threaded through all three. Draft-sync schema change affects reconcileDrafts invariants.

### AIPLAN-13 — Headline differentiator is absent from the post-login home — no launchpad card, no onboarding mention
`severity: medium` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** DASH_CARDS index.html:10898 (jobs/shopping/calibration/insights/revenue/pipeline/followups); rail entry 5601–5611; empty-state link 6140–6143
- **Problem:** The landing page leads with 'AI reads your plan' (4893), but a signed-in user lands on the dashboard where no card, tip, or CTA mentions plan reading; the feature exists only after opening the calculator, as a small uppercase rail button and an empty-state footnote that disappears once any value is entered. For the first-priced-job journey the app's most marketable time-saver depends on the user spotting an 11px button in a collapsible rail — and trial users have 5 free reads that many will never discover.
- **Evidence:** 10898 DASH_CARDS list contains no AI/plan entry (verified by title grep: Jobs, Shopping list, Pricing calibration, Insights, Revenue trend, Deal pipeline, Follow-ups); rail label text-[11px] at 5606; emptyStateScanLink at 6140 lives inside #emptyState only.
- **Recommendation:** Add a launchpad card or hero chip ('📐 Have plans? AI reads them — 5 free reads in your trial') that deep-links to the calculator and triggers readPlanFile, and mention the feature in the demo/setup nudge flow.
- **Principle:** Discoverability (Norman) + smart defaults — the shortest path to the first 'aha' should be surfaced where users actually land.
- **Breakage risk:** Launchpad card order was recently deliberately set (PR #38) — adding a card changes that layout; needs light-mode styles (theme-parity) and resources-sync if the guide lists dashboard cards.

### AIPLAN-14 — Over-cap copy tells solo contractors to 'contact your admin' — a role that doesn't exist for them
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** index.html:20005 and 20091 truncation toasts
- **Problem:** 'Contact your admin to raise the page limit' assumes an org-admin concept the product doesn't expose — the audience is solo installers and small shops; 'your admin' is the app owner. Users hitting the 100-page cap on a real commercial set get advice they can't act on, inside a 1.6s toast (see AIPLAN-2).
- **Evidence:** 20005: toast(`This plan has ${detectedPages} pages — Anchor reads up to ${MAX_PLAN_PAGES}. … contact your admin to raise the page limit.`); repeated at 20091.
- **Recommendation:** Change to 'contact support to raise the limit, or upload just the schedule sheets' and route through the persistent banner instead of a toast.
- **Principle:** UX copy — speak the user's language; error copy must name an actionable next step (NN/g heuristic #2/#9).
- **Breakage risk:** Copy only; resources-sync (guide states the page cap).

### AIPLAN-15 — readPlanModal is a vestigial error-only surface titled like a fresh start, dragging dead Grok-fallback code
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Modal HTML index.html:6163–6190; openReadPlanModal 19675–19682 (no UI caller); showPlanError opens it at 19911–19912; dead fns 19688–19744
- **Problem:** openReadPlanModal is called from no button (the rail label opens the file picker directly, 24692–24694), so the modal's only real appearance is as the error surface — yet its header still reads 'Upload Window Schedule / AI reads it and fills…', framing a failure as a fresh pitch. Meanwhile openGrokWithPrompt references '#readPlanModal details' (19695) and applyGrokResponse reads '#grokResponseInput' (19717) — elements that no longer exist in the modal (the comment at 6174 still claims 'the manual Grok steps below remain as a fallback'); applyGrokResponse would throw if ever wired.
- **Evidence:** grep openReadPlanModal → definition only; 6174 comment vs actual modal body 6175–6184 (no Grok steps); 19717: document.getElementById("grokResponseInput").value — null deref if invoked.
- **Recommendation:** Give the error state its own header ('We couldn't read that plan') via showPlanError, delete openGrokWithPrompt/parseGrokResponse-as-fallback/applyGrokResponse dead paths (parseGrokResponse itself is still used by applyFullExtraction at 20157 — keep it), and fix the stale comments.
- **Principle:** States & Feedback §5 — the error surface should look like an error, not a restart; craft: dead affordance code invites regressions.
- **Breakage risk:** parseGrokResponse is shared with the live pipeline (20157) — remove only the UI-facing fallback fns. Modal retitling must keep close bindings (24695–24697).

### AIPLAN-16 — Upload status regions are silent to screen readers and busy-state class handling is inconsistent after an error
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Status divs index.html:6182 and 6213 (no aria-live); setPlanUploadStatus 19836–19850; showPlanError class surgery 19898–19909
- **Problem:** Progress ('Reading pages 26–50…'), success, and error text are injected via innerHTML into plain divs with no aria-live/role=status, so assistive tech hears nothing during a minutes-long metered operation or on failure. Additionally showPlanError swaps the div from flex to block and strips gap classes (19900–19901), but a subsequent setPlanUploadStatus only re-adds color classes (19848–19849) — after one error, later busy/ok states render without the flex/gap layout the HTML started with (icon and text jam together).
- **Evidence:** 6182: <div id="readPlanUploadStatus" class="hidden mt-3 flex items-center gap-2 …"> — no live region; 19900: status.classList.remove("hidden","flex","items-center","gap-2",…); classList.add("block",…); setPlanUploadStatus never restores flex/items-center/gap-2.
- **Recommendation:** Add role="status" aria-live="polite" to both status divs (and the rail button's busy label), and make setPlanUploadStatus reset the full class set (add back flex items-center gap-2, remove block).
- **Principle:** Accessibility — status messages must be programmatically announced (WCAG 4.1.3); States §1 — every state fully specified, including after-error.
- **Breakage risk:** aria-live on innerHTML swaps can double-announce with the toast — keep toast() free of aria-live or dedupe. No theme impact.

### AIPLAN-17 — 'AI tools' rail section labeled 'Low impact — don't change the price on their own' while it fills the highest-impact input
`severity: polish` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Rail label + info tip index.html:5603
- **Problem:** The impact-taxonomy pill marks the AI tools 'Low impact' and the tooltip says they 'fill in the job for you but don't change the price on their own' — technically true of the buttons, but the read writes totalLF and windowCount, the inputs the app elsewhere treats as the biggest price levers. A user triaging by impact pills may skip reviewing exactly the values most likely to swing the bid, contradicting the AI badge's own 'double-check it' message.
- **Evidence:** 5603: <span class="lbl-impact low">AI tools</span> … 'Low impact … They fill in the job for you but don't change the price on their own.' vs 20172–20176 writing STATE.totalLF/windowCount (fields the tips at 5628/5634 class as high impact).
- **Recommendation:** Reword the tip: 'These fill the job's numbers from your plan — the values they set (LF, window count) drive the price, so review them.' Consider dropping the low-impact pill for this row.
- **Principle:** Consistency & honesty — signifiers must not contradict each other across the same surface (principles.md).
- **Breakage risk:** Copy only; resources-sync if the guide mirrors the impact descriptions.

## Section: Quote versioning & job comparison (the revision loop)

**Summary:** For a quoting tool, the revise-after-pushback loop is arguably journey step two — and on this branch it is the weakest surface audited. The tier-gated job-comparison feature sold on the pricing page ('Compare jobs at once 2/5/10', line 4831) is entirely unreachable: its only entry points render into DOM nodes (#savedWrap/#savedList/#compareBar/#viewCompareBtn) that were removed when Jobs moved to the dashboard, so renderSavedJobs early-returns and openComparison has no living caller — the polished comparison table and its light-mode CSS are dead code behind a paid promise. Versioning exists but is booby-trapped: 'Save as new version' clones the e-sign approval and deal status onto the unsent v2 (fabricating an 'Approved by <customer>' banner), leaves STATE.jobName stale so the very next Cmd+S or Save Job steers the user into renaming or overwriting the v1 it promised to keep, inherits v1's updatedAt so the new version sorts as old, and silently strips photos/actuals with no disclosure. Meanwhile an ordinary re-save from the Save Job modal drops deal status and the signed record entirely (while Cmd+S preserves them), and the customer PDF mints a fresh clock-based quote number on every export, so a revised quote contradicts the original in the customer's inbox with no version trail. The raw materials are good — credit-safe writes, smart auto-numbering, a genuinely well-built comparison table — but the connective tissue that keeps versions straight and reachable is missing or wrong.

**Strengths (do not regress):**
- The comparison table itself is textbook dense-data craft: sticky first column and header applied to cells with opaque backgrounds and correct z-index intersection (1176–1191), tabular numerals, a keyboard-focusable scroll region with role="region" + sr-only caption (21245–21247), and complete light-mode overrides (1200–1208, 3717) — when the entry points are rebuilt, none of this should be re-invented or regressed.
- Credit metering is trustworthy by construction: both saveAsNewVersion and doSaveJob check entitlements before building and consume the quote only after a confirmed localStorage write (15308–15315 + 15363–15367; 15163–15224), so a failed save never burns a credit — later phases must preserve this check-then-consume ordering.
- Version auto-naming is thoughtfully defensive: it strips any trailing ' vN' before deriving the next number (preventing 'Smith v2 v2'), regex-escapes the base name, scans all jobs for the max existing version (15317–15332), and the toast confirms the exact resulting name ('Saved as Smith Residence v2', 15377).
- The cap-locked compare toggle uses the correct blocked-state pattern — aria-disabled (not native disabled) keeping it focusable/readable, dimmed styling, visible '(n/cap)' count in the label, and a tap-toast naming the blocker (10784–10797, 10815, 10824–10829) — the right skeleton to keep when the feature is re-wired.

### CMP-1 — Job comparison is completely unreachable — a paid, tier-gated feature with no living entry point
`severity: critical` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** renderSavedJobs (index.html:10763–10834), viewCompareBtn binding (24639), pricing table (4831), auth copy (22179), compareModal (6416)
- **Problem:** The ONLY UI that adds jobs to compareSet is the 'Compare' toggle rendered by renderSavedJobs into #savedList, and the only opener is #viewCompareBtn — but none of #savedWrap, #savedList, #compareBar, or #viewCompareBtn exist in the HTML (grep for id="savedWrap"/"savedList"/"compareBar"/"viewCompareBtn" returns zero hits; the comment at 10768 admits 'Jobs & Pipeline section was removed from the calculator'). renderSavedJobs early-returns at 10768, the binding at 24639 uses ?. and silently no-ops, and dashJobCard (12711–12765) — the surviving job-card UI — has no compare affordance. Yet the pricing page sells 'Compare jobs at once 2/5/10' (4831) and the auth screen promises 'Save & compare jobs' (22179). A Shop-plan buyer paying $199 partly for 10-way compare can never open it.
- **Evidence:** 10765–10768: `const wrap = document.getElementById("savedWrap"); ... if (!wrap || !el) return;` with comment 'Jobs & Pipeline section was removed from the calculator (it lives on the Dashboard now)'. 24639: `document.getElementById("viewCompareBtn")?.addEventListener("click", openComparison);` — no such element. openComparison (21197) has no other caller. dashJobCard (12711–12765) renders Load/Delete/status only. Pricing row 4831: '<tr><td>Compare jobs at once</td><td>2</td><td>5</td><td>10</td></tr>'.
- **Recommendation:** Re-home the compare entry on the dashboard Jobs panel: add a compare checkbox (with the existing count/cap label logic from 10784–10797) to dashJobCard, plus a sticky 'Compare (n)' bar above #dashJobsGrid wired to openComparison(). Delete or port the dead renderSavedJobs compare code so there is one source of truth. Alternatively, if compare is being cut, remove the pricing-table row before someone buys on it.
- **Principle:** Trust & honest marketing (trust-ethics.md — an advertised capability must exist); visibility of system status / no dead ends (states-and-feedback.md §6)
- **Breakage risk:** dashJobCard layout is dense already — new control must keep 44px targets; run theme-parity on the new bar/checkbox; run resources-sync (compare is currently undocumented in the guide — document it when it becomes reachable); compareSet is session-only, confirm behavior across dashboard re-renders.

### VER-1 — 'Save as new version' silently inherits the original's e-sign approval and deal status — v2 shows as signed by the customer
`severity: critical` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** saveAsNewVersion (index.html:15334–15361), signed banner in renderJobDetails (13827–13843), pipeline stats (10738–10749, 10959, 10988)
- **Problem:** newJob is built via `{...base, ...}` (15334) and the cleanup deletes only isDraft/photos/actuals/shopChecked (15352–15361) — it never deletes `status`, `signedQuoteId`, `signedAt`, or `signerName`. Version a job the customer already e-signed and the brand-new v2 renders the green 'Approved by <signer> — Signed <date>' banner with a 'Download signed quote (PDF)' button (13827–13843) for a quote that customer has never seen, opens in the pipeline as 'Approved', and double-counts in Won value (10738–10740), approved count (10959) and signed count (10988). For a quoting tool whose e-sign record is the legal artifact, showing a fabricated approval on a revised price is a trust (and arguably legal) failure.
- **Evidence:** 15334: `const newJob = { ...base, ... }`; deletes at 15352–15361 cover isDraft, photos, photosUpdatedAt, photoPath, photo, photoUpdatedAt, actuals, actualsUpdatedAt, shopChecked — `status`, `signedQuoteId`, `signedAt`, `signerName` absent. 13827: `const isSigned = !!(job.signedQuoteId || (st === "Approved" && job.signedAt));` renders the Approved banner for the clone.
- **Recommendation:** In saveAsNewVersion, add `delete newJob.signedQuoteId; delete newJob.signedAt; delete newJob.signerName; newJob.status = "Quoted";` (a new version is by definition an unsent, unsigned quote). Optionally keep a read-only 'v1 was signed on <date>' note via a parent link (see VER-7).
- **Principle:** Never misrepresent record/agreement state (trust-ethics.md); data integrity over convenience defaults
- **Breakage risk:** Pipeline Won/win-rate numbers will drop for users who already created versions of signed jobs (that is the correction, but it will look like a regression); cloud rows for existing v2s keep stale fields — consider a one-time migration; no theme/resources impact.

### VER-2 — After versioning, stale rail state steers the very next save into overwriting the original v1
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** saveAsNewVersion (index.html:15332, 15368 — no STATE.jobName update), quickSaveOrPrompt (15266), confirmSaveJob twin check (15119–15138), conflict modal (6319–6330)
- **Problem:** saveAsNewVersion sets the new job's name to 'Smith Residence v2' (15332) and switches STATE.currentJobId to v2 (15368) but never updates STATE.jobName or the rail's job-name input (contrast applyJobToState at 15550, which does). Consequences: (a) the rail still displays the OLD name while v2 is loaded; (b) Cmd+S renames v2 back to 'Smith Residence' (15266 prefers non-empty STATE.jobName), producing two identically-named jobs and destroying the version label; (c) 'Save Job' prefills the old name (15077), the unchanged-check fails, twin() matches v1 (15125–15132), and the conflict modal appears with 'Overwrite the existing job' as its primary gold button (6325) — one tap replaces v1's quoted numbers, the exact record 'Save as new version' promised to keep ('keeping the original', 6105 title).
- **Evidence:** 15332: `const newName = `${baseName} v${nextV}`;` — assigned to newJob only. 15368: `STATE.currentJobId = newJob.id;` with no `STATE.jobName = newName`. 15550 (loadJob path): `STATE.jobName = j.name || ""` shows the intended sync that versioning skips. 15266: `name: (STATE.jobName != null && STATE.jobName !== "") ? STATE.jobName : existing.name`.
- **Recommendation:** After the confirmed write in saveAsNewVersion, sync state exactly like a load: `STATE.jobName = newName;` and refresh the rail input (jobNameInput at 14390), or simply call applyJobToState(newJob) + bindControls(). Add a regression test for save-after-version.
- **Principle:** Prevent > undo > confirm (ux-pitfalls.md §9) — the system must not manufacture the destructive collision it then asks the user to resolve
- **Breakage risk:** writeDraftJob uses STATE.jobName for draft naming (15412–15415) — verify drafts don't pick up ' v2 (draft)' names unexpectedly; rail input re-render must not clobber mid-typing edits.

### VER-3 — Ordinary re-save from the Save Job modal silently wipes deal status and the e-sign record (inconsistent with Cmd+S)
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** doSaveJob rebuild + carry block (index.html:15178–15219), vs quickSaveOrPrompt spread (15263–15284), confirmSaveJob (15128–15134)
- **Problem:** The overwrite path rebuilds the job object from STATE (15178–15197) and the carry-forward block (15199–15214) restores only photos, actuals and shopChecked — not `status`, `signedQuoteId`, `signedAt`, `signerName`, or `customerRecurring`'s siblings. Re-saving an 'Approved' (even signed) job via Save Job → 'Save Job' resets it to 'Quoted' (jobStatus fallback, 10685–10688) and deletes its signed banner and signed-count contribution — silently. Meanwhile Cmd+S uses `{...existing, ...}` (15263) and KEEPS those fields: the same user intent ('update this job') has two different data outcomes depending on which affordance was used. This is the exact 'STATE-rebuild fns drop job-only fields' failure the project has already hit with photos.
- **Evidence:** 15199–15214 carry list: photos, photosUpdatedAt, photoPath, photo, photoUpdatedAt, actuals, actualsUpdatedAt, shopChecked — nothing else. 15218: `next = next.map(x => x.id === id ? job : x);` replaces the record wholesale. 15263: quickSaveOrPrompt builds `{...existing, ...}` preserving everything.
- **Recommendation:** In the doSaveJob overwrite path, extend the carry block: `if (_photoSrc.status) job.status = _photoSrc.status;` plus signedQuoteId/signedAt/signerName (and audit for other job-only fields with a shared CARRY_FIELDS list used by every STATE-rebuild fn). Better: build overwrites as `{...overwrite, ...stateFields}` like Cmd+S does.
- **Principle:** Consistency of identical actions; no silent data loss (ux-pitfalls.md; states-and-feedback.md)
- **Breakage risk:** Must NOT carry signed fields when the numbers changed materially? — no: an in-place update of a signed job arguably deserves its own warning, but preserving the record is strictly safer than deleting it. Verify cloud push doesn't diverge; no theme impact.

### VER-4 — The revision path is undiscoverable: no 'duplicate & revise' where pushback actually lands (Job Details, follow-ups), and the button's safety promise is hover-only
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** saveAsNewVersionBtn (index.html:6105), visibility rule (15381–15390), Job Details footer (13960–13965), follow-ups nudge (11517–11527)
- **Problem:** When a customer says 'too expensive', the contractor's entry points are the follow-ups panel ('Open job' → Job Details, 11525) and the job card ('View job details', 12741). Neither surface offers a revise/duplicate action — Job Details' footer has only Delete / Save changes / 'Open in calculator →' (13961–13964). The versioning affordance is a button in the calculator results footer that is hidden by default (6105 class 'hidden') and only appears when a non-draft saved job is loaded (15381–15390); a user must load the job, scroll past the full breakdown, and correctly guess that 'Save as new version' preserves the original — a promise stated only in a title attribute ('Save as a new version, keeping the original', 6105) that touch users can never see. Contractors quoting in the field will instead edit and hit Save Job, overwriting v1 (see VER-3).
- **Evidence:** 6105: `<button id="saveAsNewVersionBtn" class="hidden btn ..." title="Save as a new version, keeping the original">Save as new version</button>`. 13960–13965: footer renders `data-jd-delete`, `jdSave`, `jdOpenCalc` only. 15381–15390: shown only when `STATE.currentJobId` resolves to a non-draft job.
- **Recommendation:** Add a 'New version' button to the Job Details footer (clones via saveAsNewVersion using that job id, then opens it in the calculator), and put the promise in visible microcopy under the results button: 'Keeps the original quote untouched.' Consider renaming to 'Duplicate as v2' which states the outcome.
- **Principle:** Recognition over recall; put the action where the task is (navigation-depth.md); hover-only affordances fail on touch (implementation.md §5)
- **Breakage risk:** Job Details footer wraps on small screens — 4th button needs layout care; run theme-parity on the new button and resources-sync (guide should document the revision workflow); saveAsNewVersion currently reads STATE, so the Job-Details variant must operate on the stored job, not calculator state.

### VER-5 — Quote numbers are minted from the clock per export — a revised v2 PDF contradicts v1 in the customer's inbox with no version trail
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** exportCustomerPDF (index.html:15804), version naming (15317–15332)
- **Problem:** The customer PDF prints `Quote No. ${Date.now().toString().slice(-8)}` (15804): every export of ANY job — including re-exporting the identical v1 — gets a fresh arbitrary number, and the job's version name ('… v2') never appears on the customer document. After a revision, the homeowner holds two PDFs with unrelated quote numbers, no 'revised'/'supersedes' marker, and only the date and price to tell them apart. Disputes ('you quoted me X') become unresolvable, and the contractor can't reference a stable number on the phone.
- **Evidence:** 15804: `doc.text(`Quote No. ${Date.now().toString().slice(-8)}`, pageW - M, y, { align: "right" });` — derived from export time, not from the job. Version naming exists only in j.name (15332) which the customer PDF never prints.
- **Recommendation:** Persist a per-job quote number at save time (short hash of job id), print it on every export of that job, suffix the version ('Quote No. 4823-v2'), and on versions add one line: 'Revises Quote No. 4823 dated <v1 date>'. saveAsNewVersion already knows the base job to reference.
- **Principle:** Document trust: stable identifiers, no surprise contradictions (trust-ethics.md; data-display-and-density.md §7 on numeric trustworthiness)
- **Breakage risk:** E-sign snapshot and public quote viewer (#/q/…) should show the same number or none — audit both before shipping; existing customers' old PDFs won't match the new scheme (acceptable); resources-sync for the guide's PDF description.

### VER-6 — A freshly saved v2 sorts as old on the dashboard — it inherits v1's updatedAt
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** saveAsNewVersion (index.html:15334–15351), dashboard sort (12783–12791)
- **Problem:** newJob spreads `...base` (15334) and the overrides set `createdAt` but never `updatedAt` (15339–15351), while every explicitly saved job has updatedAt (15186). The dashboard 'recent' sort keys on `updatedAt || createdAt` (12785), so a just-created v2 lands at v1's last-edit position — buried below anything touched since — and ties exactly with v1 (ambiguous order). The user taps 'Save as new version', opens the dashboard, doesn't see v2 at the top, and reasonably concludes the save failed.
- **Evidence:** 15334–15351: override list ends at `perLfCost: r.perLfCost, rows: r.rows` — no updatedAt (compare doSaveJob 15186 and the in-place update at 15284 which both set it). 12785: `const jts = (j) => Date.parse(j.updatedAt || j.createdAt || "") || 0;`.
- **Recommendation:** Add `updatedAt: new Date().toISOString()` to the newJob literal in saveAsNewVersion.
- **Principle:** Visibility of system status — the result of an action must be observable where the user looks next (states-and-feedback.md)
- **Breakage risk:** updatedAt participates in cloud last-edit-wins reconciliation (draft sync memory note) — a fresh timestamp on a new id is correct and safe, but re-check reconcileDrafts invariants.

### VER-7 — Versions have no data-level lineage — identity hangs on a fragile name regex, and nothing shows which version the customer saw
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** version derivation (index.html:15317–15331), dashJobCard (12711–12746), renderJobDetails header (13874–13884)
- **Problem:** Version chains exist only as name strings matched by `^base(?:\s+v(\d+))?$` (15321). Renaming either job in Job Details (jdJobName, 13892 → saveJobDetailsEdits 13752) silently breaks the chain: numbering restarts and a second 'Smith Residence v2' can be minted. The dashboard card shows just the name (12744); Job Details' subtitle says only 'Saved job' (13878). Nowhere can a contractor see 'this is version 2 of 3', which one was exported/sent, or jump between versions — with multiple revisions per customer they must reconstruct history from names and prices.
- **Evidence:** 15320–15331: regex over j.name is the sole linkage; no parent id stored on newJob (15334–15351). 13878: `${job.isDraft ? "Working draft" : "Saved job"}` — no version context. dashJobCard has no version badge (12719 renders only a Draft pill).
- **Recommendation:** Store `parentJobId` and `version: nextV` on the new job (and `version: 1` lazily on the base). Render a small 'v2' pill next to the name on dashJobCard (mirroring the Draft pill at 12719) and a 'Versions: v1 · v2 ←' row in Job Details linking siblings. Keep the name suffix for continuity but derive numbering from the field, not the regex.
- **Principle:** Match the data model to the user's mental model; recognition over recall (principles.md)
- **Breakage risk:** New fields ride jobs.data cloud sync (schemaless JSON — safe); the vN name suffix logic must not double-apply; theme-parity for the new pill; resources-sync for the versioning docs.

### VER-8 — Versioning silently drops photos, logged actuals, and shopping checkmarks with zero disclosure
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** saveAsNewVersion deletes (index.html:15352–15361), success toast (15377)
- **Problem:** The clone strips the cover photo, the entire install gallery, actuals, and shopping-list checks (15356–15361). The photoPath rationale is sound (shared Storage paths would cross-delete, per the comment at 15353–15355) but the UX is silent: the only feedback is 'Saved as Smith Residence v2' (15377). A contractor who versions a job with site photos discovers in the field that v2 has none — indistinguishable from a sync bug, and consistent with this project's known photo-loss bug class.
- **Evidence:** 15356–15357: `newJob.photos = []; delete newJob.photosUpdatedAt; delete newJob.photoPath; delete newJob.photo; delete newJob.photoUpdatedAt;` 15377: `toast(`Saved as ${newName}`);` — no mention of what was left behind.
- **Recommendation:** Short-term (S): extend the toast or add a one-time note — 'Saved as … v2 · photos & logged actuals stay on the original.' Long-term (L): copy the Storage objects to `<user>/<newJobId>.jpg` paths so v2 keeps its site photos safely.
- **Principle:** No silent data loss — disclose consequences at the moment of action (states-and-feedback.md; trust-ethics.md)
- **Breakage risk:** Toast length on 375px (keep under two lines); if photos are later copied, watch storage quotas and the delete-job photo cleanup at 15584–15590.

### VER-9 — 'Save as new version' has no double-fire guard — each accidental extra tap mints a junk version and burns a quote credit
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** binding (index.html:24090–24091), saveAsNewVersion credit spend (15311–15315, 15362–15367)
- **Problem:** The button is bound directly to saveAsNewVersion with no disabled/busy state or idempotency check (24090–24091). The function runs synchronously: a double-tap (common on mobile) creates v2 AND v3 with identical contents, consuming two monthly quote credits (15367). There is no undo — deleting the junk version does not refund the credit — and nothing warns that versioning an unchanged job is pointless.
- **Evidence:** 24090–24091: `const saveVerBtn = document.getElementById("saveAsNewVersionBtn"); if (saveVerBtn) saveVerBtn.addEventListener("click", saveAsNewVersion);` — no guard. 15367: `if (needsQuote) consumeQuote();` on every invocation.
- **Recommendation:** Disable the button for ~1s inside the handler; additionally compare the current jobFingerprint (17106) against the loaded job and confirm ('Nothing changed since v1 — save an identical v2?') before spending a credit.
- **Principle:** Prevent > undo > confirm; make repeated taps idempotent (ux-pitfalls.md §9)
- **Breakage risk:** Fingerprint excludes some fields (doors variants included; customer fields excluded) — an over-eager 'unchanged' prompt could annoy; keep it advisory, never blocking.

### CMP-2 — Comparison table is near-unusable at 375px: 200px frozen column + 140px job columns inside a padded modal leave <100px of scroll viewport
`severity: medium` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** renderComparisonModal (index.html:21232, 21250–21251), compareModal shell (6416–6430)
- **Problem:** The frozen 'Item' column is min-width:200px (21250) and each job column min 120–140px (21232). The modal has p-4 inset padding plus px-6 body padding (6416, 6430): on a 375px phone that's ~295px of content width, so the sticky column consumes ~68% and the user sees a ~95px sliver of one job at a time — the side-by-side comparison degrades into scroll-and-remember, the exact failure the frozen-column pattern exists to prevent. There is also no scroll-shadow/affordance hinting that more columns exist.
- **Evidence:** 21250: `style="min-width:200px;"` on the sticky th; 21232: `const jobColMin = jobs.length >= 6 ? 120 : 140;`; 6416: modal `p-4`; 6430: `#compareBody ... px-6`.
- **Recommendation:** On small screens: drop body padding to px-2, cap the frozen column at ~40% of viewport (min-width:120px with two-line wrapping), and add edge scroll-shadows on .cmp-scroll. Consider a 2-job mobile mode with columns sized to split the remaining width evenly (Starter's cap is 2 anyway).
- **Principle:** Frozen identity column must not dominate the viewport; scroll affordance required (data-display-and-density.md §3–4)
- **Breakage risk:** Sticky-cell backgrounds and the light-mode overrides at 1200–1208 must be preserved; test the 6-job Shop case in landscape; theme-parity on new shadows.

### CMP-3 — compareModal (like all modals here) has no dialog semantics or focus management
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** compareModal (index.html:6416–6432), openComparison (21204–21206); file-wide grep role="dialog" = 0 matches
- **Problem:** The modal is a positioned div toggled via classList (21204–21206) with no role="dialog", no aria-modal, no aria-labelledby pointing at 'Job Comparison', no focus move on open, and no focus trap — a grep confirms zero role="dialog" in the entire file, so this is systemic, but compare is a data-dense surface where a screen-reader user dropped into a 40-row table with no announced context is fully lost. Keyboard users' focus remains on the (dead) trigger behind the backdrop.
- **Evidence:** 6416: `<div id="compareModal" class="fixed inset-0 hidden items-center justify-center p-4 z-50">` — no ARIA dialog attributes; 21204–21206 only toggles classes. Positive: the scroll region itself has role="region" + caption (21245–21247).
- **Recommendation:** Add role="dialog" aria-modal="true" aria-labelledby="(header h3 id)" to the modal card, focus the close button on open, restore focus on close, and handle Escape. Fix compare first, then roll the same helper across the other modals.
- **Principle:** WCAG 2.1 AA dialog pattern; focus management (accessibility.md; review-checklist.md)
- **Breakage risk:** A shared focus-trap helper can conflict with the settings-search combobox and nested modals (conflict modal layers over save modal at z-70) — scope per-modal and test stacking order.

### CMP-4 — On-screen comparison exposes cost/profit/markup with no 'internal only' cue (the PDF has one; the screen doesn't)
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** renderComparisonModal footer rows (index.html:21269–21285), modal header (6421–6422), PDF footer (21371)
- **Problem:** The comparison table renders internal Total Cost, Profit and Markup rows (21271–21284). The exported PDF explicitly footers 'Internal job comparison — not for customer distribution' (21371), but the on-screen modal header says only 'Side-by-side cost breakdown' (6422). The natural field use — comparing two option packages WITH the homeowner on a phone — leaks the contractor's profit and markup.
- **Evidence:** 21279–21284: Profit and Markup rows unconditionally rendered; 21371: `"Internal job comparison — not for customer distribution"` exists only in exportComparisonPDF.
- **Recommendation:** Add the same 'Internal — not for customers' tag to the modal subtitle, and offer a 'customer-safe view' toggle that hides Total Cost/Profit/Markup rows (mirrors the Summary/Itemized detail toggle already used for e-sign at 13939–13942).
- **Principle:** Audience-appropriate disclosure (trust-ethics.md); consistency between screen and export
- **Breakage risk:** Toggle state must not leak into the PDF export path; theme-parity on the tag; resources-sync if the guide documents comparison.

### CMP-5 — Compare cap is explained via title attribute + toast only, and never before purchase intent forms in-app
`severity: low` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** cap UI (index.html:10784–10797, 10815, 10824–10829), pricing row (4831)
- **Problem:** When the (currently dead) compare UI renders, the cap-locked button's 'why' lives in a title attribute (10795–10797) — invisible on touch; the tap-toast at 10828 does cover touch, but only names the limit after the user tries. There is no upsell path from the cap moment (contrast showUpsellModal used everywhere else, e.g. 15314): a Starter user who wants 3-way compare hits 'remove one first' with no 'Pro compares 5' link. The only proactive communication is the pricing-page table row (4831).
- **Evidence:** 10796: `title="You can compare up to ${cap} jobs on your plan — remove one first"`; 10828: toast with the same copy — neither mentions upgrading; showUpsellModal(chk.reason) pattern exists at 15314 but is unused here.
- **Recommendation:** When reviving compare (CMP/VER-1), route the cap tap to showUpsellModal with a compare-specific reason ('Compare up to 5 on Pro'), keep the aria-disabled + toast pattern, and keep the '(n/cap)' count in the visible label.
- **Principle:** Blocked-state must name the blocker and the path forward (states-and-feedback.md §6); tie-in to fair upsell moments (trust-ethics.md)
- **Breakage risk:** Upsell copy must match real plan caps (2/5/10) — resources-sync + pricing table consistency check.

## Section: Field resilience & load performance — offline/flaky-network spine of the first-job journey

**Summary:** Online, the first-login→first-priced-job journey sits on a genuinely local-first core: every save/draft/settings write lands in localStorage synchronously, the cloud is a best-effort backing store with a durable retry queue, and quote credits are spent only after a confirmed local write — so building and saving the first job works fine in a dead zone once the app is open. The failure is everything around that core. Cold load is a ~880KB, 5-origin, parser-blocking CDN waterfall (1.44MB HTML ≈ 321KB brotli, plus Tailwind JIT, jsPDF, autotable, supabase all in <head>) with the boot splash unreachable until head parsing completes — a landing visitor on job-site LTE stares at an unstyled blank page for 5–15s, and because a purge routine actively deletes any service worker and caches while the manifest invites 'install to home screen', a cold start with no signal is a browser error page, full stop. When the network is merely flaky rather than dead, the unhappy paths surface through a 1.6-second, single-slot, non-ARIA toast (including the load-bearing 'Saved locally — cloud sync failed'), the only offline indicator lives in a header the dashboard completely covers, returning users hang on the splash behind three un-timed sequential cloud calls, and if the load-time CDN fetch for jsPDF ever failed, six of the eight PDF export buttons die with an uncaught exception and zero feedback. The sync state machine itself (pendingPush, reconcileDrafts, profileDirty) is the best-engineered part of the app and honors the pill's 'they'll sync when the connection returns' promise for jobs, drafts, and settings; the presentation layer around it does not.

**Strengths (do not regress):**
- Local-first persistence done right: doSaveJob writes localStorage synchronously and only then fires best-effort cloud push (15217–15231), the quote credit is consumed only after a confirmed local write (15167–15171, 15224), and an offline save gets an honest 'Saved locally — cloud sync failed' toast plus a durable pendingPush entry (21995–22001). Saving the first job never blocks on the network.
- The offline sync state machine is carefully engineered against data loss: durable pendingPush queue survives reload (21737–21748), reconcileDrafts never drops an unsynced local job or infers deletes destructively (21786–21819), profileDirty gates pull-clobber of offline settings edits (8354–8358, 21876–21897), offline entitlement consumes merge by max-counter (21840–21844), and drain triggers on online/visibilitychange (21464–21471). Later phases must not regress these invariants.
- Payoff-step graceful degradation exists where it was designed in: PDF preview falls back to a plain download with an explanatory toast (15606–15615), native share falls back to download (15689–15710), and the AI plan-read flow has stage-by-stage progress copy, one transient retry, partial-result honesty ('Read X of Y sections'), and a billed-image cache so a local failure never double-charges (20027–20091, 13363–13407).
- Public customer routes (#/q/, #/sign/) skip jsPDF/supabase/Three.js entirely via the head route gate (27–53), keeping the customer-facing quote link light — the one page a homeowner opens on their phone is the cheapest one.

### FLD-1 — Zero offline cold start — service workers are actively purged while the manifest invites PWA install
`severity: high` · `kind: flaw` · `effort: L` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** purgeStaleSW() index.html:21379–21392; manifest + apple-mobile-web-app-capable meta :7, :10, :18; offline pill promise :5451
- **Problem:** A contractor who installed Anchor to their home screen (the manifest and apple-mobile-web-app meta explicitly enable this) and opens it in a basement or dead zone gets the browser's 'You're offline' error page — not the app. All of their rates, jobs, and drafts are sitting in localStorage, but the HTML itself cannot load: there is no service worker, and purgeStaleSW() actively unregisters any SW and deletes all caches to solve a past staleness problem. The header pill's promise ('Your latest changes are stored on this device') is true only if the tab never closed.
- **Evidence:** purgeStaleSW() at 21379–21392 calls serviceWorker.getRegistrations()→unregister() and caches.keys()→delete() for every key; the head links manifest.webmanifest (line 18) and sets apple-mobile-web-app-capable=yes (line 7). No 'serviceWorker.register' exists anywhere in the file (grep confirms only the purge). _headers has security headers only — no caching strategy.
- **Recommendation:** Add a minimal network-first app-shell service worker: try network for index.html, fall back to the last cached copy when the fetch fails; cache the four pinned CDN scripts cache-first (they're version-pinned + SRI'd, so staleness is impossible). Keep skipWaiting+clients.claim so updates land on next online load, which preserves the intent behind purgeStaleSW. Replace the purge with a version-keyed cache cleanup inside the SW's activate handler.
- **Principle:** States & feedback §5 — offline error scope should be 'banner or inline; full-screen only if nothing usable is cached'; here everything usable IS on the device. Also implementation.md §7 reality check: field tools must be tested against real network conditions.
- **Breakage risk:** This reintroduces the exact stale-update risk purgeStaleSW was written to kill — a wrong SW strategy could pin users to an old build (the repo memory notes prod deploys are manual, making staleness windows long). Must be network-first for the HTML, never cache-first. Resources guide should gain an 'offline' section (resources-sync).

### FLD-2 — Cold load paints nothing — blank unstyled screen for the whole 5-origin CDN waterfall, with export-only libraries on the boot critical path
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** head scripts index.html:39–54 (Tailwind :39, document.write jsPDF/autotable/supabase :47–53), fonts CSS :85–87, style block :100–3727, first paintable element #bootSplash :4328
- **Problem:** A first-time visitor (the landing page IS the first-job journey's front door) sees a default-white, completely unstyled viewport until every head resource resolves: 1.44MB HTML (measured 321KB brotli / 367KB gzip), Tailwind Play CDN (~100KB gz, then a full-document JIT scan), jsPDF (~118KB gz), autotable, and supabase — the last three written with document.write so the preload scanner can't even start fetching them until the Tailwind script has executed, serializing the waterfall across cdnjs and jsdelivr with no preconnect hints (only fonts get preconnect, :85–86). On good 4G that's ~3–5s of blank white; on 1-bar job-site LTE with 400ms RTT it's 10s+ — past the NN/g attention limit before the splash (line 4328, after 3,700 lines of head CSS) can even render. jsPDF and autotable aren't needed until the first PDF export, yet they block first paint.
- **Evidence:** Line 39 loads cdn.tailwindcss.com/3.4.16 synchronously; lines 47–53 document.write three more parser-blocking scripts; line 87 adds render-blocking fonts CSS; body begins at 3729 and the splash div at 4328 — nothing can paint before the entire head completes. Measured: gzip -c index.html = 367,417 bytes; brotli = 321,299 bytes.
- **Recommendation:** (1) Move jsPDF + autotable off the critical path — inject on first export via a shared ensureJsPdf() loader (pairs with FLD-4). (2) Add <link rel=preconnect> for cdnjs.cloudflare.com and cdn.jsdelivr.net and replace document.write with plain <script defer> tags gated by the same route check (the route flag is known at line 28, before any of them). (3) Hoist a tiny critical-CSS block (background #020617 + splash styles) above the Tailwind script so the anchor splash paints within the first ~50KB of HTML.
- **Principle:** implementation.md §7 — LCP ≤2.5s at p75, 'keep the critical path small'; ux-pitfalls §8 — 10s attention limit; states-and-feedback §2 — a full-page load deserves an immediate loading shell.
- **Breakage risk:** Script-order dependencies: boot() at 23348 assumes window.supabase exists at DOMContentLoaded — defer preserves execution-before-DOMContentLoaded, but the public-route gate logic must be re-verified on #/q/ and #/sign/ routes. Hoisted splash CSS must be mirrored in the light-mode override (3627 area; theme-parity).

### FLD-3 — Six of eight PDF export paths crash silently if jsPDF never loaded — and the two guarded ones promise a retry that can never succeed
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** exportCustomerPDF :15744, exportPDF :16548, exportMaterialsPDF :16814 (fn starts 16765, no guard), exportCutListPDF :21079, exportComparisonPDF :21298, exportPricingChecklistPDF :23963; the only guards at :16353 and :16380
- **Problem:** The CDN scripts load exactly once, at initial parse (47–53); there is no re-injection mechanism anywhere. If that load failed — flaky LTE at page-open, captive portal, cdnjs hiccup — window.jspdf is undefined for the entire session. Tapping 'Customer Quote' (the payoff of the whole first-job journey) then throws an uncaught TypeError destructuring window.jspdf at 15744: the button does nothing, no toast, no error, dead. Five other exports share the hole. The two functions that DO guard (16353, 16380) show 'PDF engine still loading — try again', which is false — it is not loading and never will; retrying is false hope.
- **Evidence:** Line 15744 `const { jsPDF } = window.jspdf;` executes with no preceding window.jspdf check (guard-free path confirmed from fn start at 15725). Grep shows guards only at 16353/16380. No code path ever re-creates the script tags after the head's document.write (47–53).
- **Recommendation:** One shared ensureJsPdf(): resolve immediately if window.jspdf exists; otherwise inject the same SRI-pinned script tags with onload/onerror, show 'Loading PDF engine…' on the pressed button, and on error give a real recovery: 'Couldn't load the PDF engine — check your connection and Retry'. Call it at the top of all eight export functions. This also enables FLD-2's deferral.
- **Principle:** States-and-feedback §5 — match recovery to cause (Retry for transient load failures), never a silent no-op; §1 state matrix — the error state of the export button is currently unspecified.
- **Breakage risk:** Must reuse the exact pinned URLs + SRI hashes from 49–50 or the integrity check will reject the load. If combined with FLD-2's deferral, verify the buck cut list and dashboard dashGenerateDoc paths that export without visiting the calculator.

### FLD-4 — Every unhappy-path message rides a 1.6-second, single-slot, screen-reader-invisible toast
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** toast() index.html:14703–14709 (1600ms), element :7381 (no role/aria-live), CSS :1326–1335; critical payloads at :22000, :8372, :15221, :20088–20091, :23443
- **Problem:** The offline story communicates almost exclusively through toast(), which auto-dismisses in 1.6s — less than half the Material 4s minimum — keeps only one message (clearTimeout + textContent overwrite), and has no ARIA live region. 'Saved locally — cloud sync failed' (22000), the 120-char storage-full recovery instructions (15221), and 'Offline — using local data' (23443) vanish before a field user finishes the first clause. Worse, the plan-read flow fires 2–3 toasts back-to-back (20088–20091: credits used → partial-read warning → truncation notice), each clobbering the previous, so the user sees only the last for 1.6s. A blind user hears none of them.
- **Evidence:** Line 14708: `toast._t = setTimeout(() => t.classList.remove("show"), 1600);` Line 7381: `<div id="toast" class="toast">` — no role=status/aria-live. Lines 20088–20091 issue up to three sequential toast() calls in one code path.
- **Recommendation:** Scale duration by message length (min 4s, ~+50ms/char, cap 10s), queue instead of overwrite, and add role="status" aria-live="polite" to the primed #toast element. For the load-bearing offline messages ('cloud sync failed', storage-full), additionally surface the state inline — the offline pill already exists as the persistent channel; make pushJobToCloud's failure also set a one-line notice in the save-jobs rail.
- **Principle:** States-and-feedback §4 — toasts 4–10s, one at a time, queued; never put must-read info only in a toast; ARIA live region required for auto-dismissing messages.
- **Breakage risk:** Longer-lived toasts may overlap the sticky results bar / bottom CTAs on mobile — verify bottom offset (currently 28px, :1327) against safe-area. Light-mode toast override must be re-checked (theme-parity).

### FLD-5 — The offline indicator is invisible on the dashboard — the screen signed-in users actually land on
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** #offlineIndicator only in #appHeader :5451 (header at :5422, z-40); dashboardScreen :5227 (fixed inset-0 z-74) with its own nav :5228–5245 containing no indicator
- **Problem:** Signed-in users land on the dashboard (openDashboard, 10848), a fixed full-screen overlay that completely covers the calculator header holding the app's only offline pill. Every dashboard-launched action — e-sign sends, job-detail doc downloads, photo adds, shopping list — runs with zero offline visibility: markCloudError() dutifully sets body.is-offline (21424) but nothing on screen renders it. The user who opens Anchor in a dead zone sees a normal-looking dashboard, taps 'Create signing link', and gets a 1.6s 'Couldn't create the signing link' with no explanation that they're offline.
- **Evidence:** grep shows exactly one #offlineIndicator element (5451), inside #appHeader (5422). dashboardScreen's nav (5228–5245) lists dashHome/dashFL/dashOpenCalc/dashPfpBtn/theme-toggle only. CSS `body.is-offline #offlineIndicator` (2790) can't help when the element is underneath a z-74 overlay.
- **Recommendation:** Promote the pill to a single body-level fixed element (it already reads from body.is-offline, so one element can serve every screen), or clone it into the dashboard nav next to dashOpenCalc. Also render it inside the save-job modal header, where the 'will it sync?' question is most acute.
- **Principle:** NN/g visibility of system status — connectivity state must be visible where actions depend on it, not one screen away; states-and-feedback §1 (offline is a designed state of every screen, not one header).
- **Breakage risk:** The light-mode override targets the id (3627–3628) — moving/duplicating requires switching to a class or duplicating the override (theme-parity pass required). Keep ids unique if cloning.

### FLD-6 — Returning-user boot blocks on three sequential, un-timed cloud calls behind the splash
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** boot() session branch :23421–23425 → enterApp() :23438–23444 → syncFromCloud() :21857–21901 (auth.getUser :21859, profiles select :21863, jobs select :21899)
- **Problem:** A returning field user with a valid session gets `await enterApp()` → `await syncFromCloud()`, which is three sequential Supabase round-trips with no timeout. With 1-bar LTE (navigator.onLine === true, so the fast-fail path never fires) each fetch can stall for tens of seconds, and the user stares at the pulsing anchor splash — while literally every byte needed to render their dashboard and price a job is already in localStorage. This is distinct from MOB-11 (sign-in button spinner) and AUTH-12 (SDK-missing fallback): it's the everyday reopen-the-app-at-the-jobsite path.
- **Evidence:** 23424: `await enterApp(); openDashboard();`. 23440: `await syncFromCloud()` — the catch only fires on rejection, which a stalled-but-alive connection may not produce for 60s+. syncFromCloud has no Promise.race/AbortController (grep for timeout wrappers around these calls returns nothing).
- **Recommendation:** Race syncFromCloud against a ~5s timer: on timeout, proceed into the app with local data (the existing catch already does exactly this — reuse it), mark cloud-error so the pill shows, and let the sync finish in the background; reconcileDrafts/renderSavedJobs already handle a late-arriving pull. Keep the hard await only when localStorage has no data yet (true first login on a device).
- **Principle:** ux-pitfalls §8 — 10s attention limit; optimistic/local-first rendering with background reconcile (states-and-feedback §7); the app's own architecture ('the cloud is just the backing store', comment at 21722) argues for this.
- **Breakage risk:** Entering before the pull completes can briefly show stale jobs/entitlements that then update — the _recentWrites/pendingPush invariants protect data, but verify the fresh-device-with-empty-localStorage case still hard-waits (otherwise a second device would flash an empty dashboard). Demo-banner/setup-nudge logic reads DATA post-sync; re-run renderDemoBanner after the late sync lands.

### FLD-7 — Offline photo add can end in a false 'Photo added' success after the save actually failed
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** addJobGalleryPhotos :12969–12996 (saveJobs return ignored at :12992); saveJobs quota catch :8368–8376; gallery handler success toast :13684
- **Problem:** Offline, gallery photos fall back to inline base64 (~150–400KB each after the 1400px/0.82 compression at 13681, up to 24 per job at 12974) — which can blow the ~5MB localStorage quota. saveJobs then catches the quota error, toasts a 120-char recovery message for 1.6 seconds, and returns false — but addJobGalleryPhotos ignores the return value (12992), and the input handler unconditionally toasts 'N photos added' (13684) immediately after, overwriting the failure with a fabricated success. The contractor believes the install photos are on the job; they were dropped.
- **Evidence:** 12992: `saveJobs(jobs);` — return unchecked. 8369–8375: catch toasts and `return false`. 13683–13684: `await addJobGalleryPhotos(id, dataUrls); toast(dataUrls.length === 1 ? "Photo added" : ...)` — unconditional.
- **Recommendation:** Make addJobGalleryPhotos return saveJobs' result; on false, skip the success toast and show a persistent inline error in the gallery section ('Couldn't store N photos — device storage is full. They'll need to be re-added once you're online.'). Additionally trigger migrateBase64Photos() from _drainCloud (21754) — today it runs only at enterApp (23469), so base64 photos stay bloating localStorage and the cloud job row until the next full app entry.
- **Principle:** States-and-feedback §7 — rollback on failure must notify; a silent rollback (here: silent drop + false success) is a data-loss trap. Trust: never claim success the system didn't achieve.
- **Breakage risk:** Low — pure feedback correction. Wiring migrateBase64Photos into the drain path must respect its not-reentrant loop (it awaits pushJobToCloud per job); guard with a busy flag like _flushingPending.

### FLD-8 — E-sign dashboard panel renders a network failure as '0 awaiting / 0 signed' — error dressed as empty
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** renderDashEsign :12074–12101 (catch → rows=[] at :12092–12095; counters at :12100–12101); no loading state before the await
- **Problem:** On flaky LTE the shared_quotes fetch fails and the catch comment says 'Quiet failure' — the panel then renders '0 awaiting / 0 signed' badges and an empty tracking list, indistinguishable from 'no customer has signed anything.' An installer checking whether the customer signed yesterday's quote reads a confident false negative. There is also no loading state: the async function paints nothing into the drill-in until the fetch resolves, so a slow connection shows a blank region with no spinner.
- **Evidence:** 12092–12095: `catch (e) { rows = []; }` with the quiet-failure comment; 12100–12101 compute awaiting/signed from the empty array; 12077 unhides the wrap before the await with no interim skeleton/spinner.
- **Recommendation:** Track fetch failure separately from empty: on error render an inline error block ('Couldn't load your e-signatures — check your connection. [Retry]') above the still-usable sender; on success-but-empty keep the current empty copy. Paint a small spinner or 2-row skeleton into #dashEsign before awaiting.
- **Principle:** States-and-feedback §3 — error / first-use / no-results are three different screens; 'the data may well exist and just didn't load'; never flash confident zeros on a data-bearing screen.
- **Breakage risk:** None functional; new error/skeleton markup needs light-mode styling (theme-parity) and the Resources guide's e-sign section mentions the tracking list (resources-sync check).

### FLD-9 — Create-signing-link has no timeout and no offline awareness — button can hang in 'Creating link…' indefinitely
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** createSignLink :16290–16342 (button disabled :16300, insert :16312–16320, generic failure copy :16325)
- **Problem:** The e-sign send disables the button, sets 'Creating link…', and awaits a Supabase insert with no timeout. Mid-action network loss on a stalled (not dead) connection leaves the button disabled for however long the browser's TCP stack takes to give up — minutes — with no way to cancel. When it does fail, the copy is 'Couldn't create the signing link' with no cause or recovery guidance, and (per FLD-5) the offline pill isn't visible on the dashboard or Job Details modal where this button lives. E-sign is a hard-blocked-offline step; the UI should say so.
- **Evidence:** 16300: `btn.disabled = true; btn.textContent = "Creating link…";` 16312: plain `await sb.from("shared_quotes").insert(...)` — no Promise.race/AbortController. 16325: `toast("Couldn't create the signing link")` — 1.6s, causeless.
- **Recommendation:** Pre-check `navigator.onLine === false || _cloudOffline` and short-circuit with 'You're offline — signing links need a connection. Your job is saved and ready to send.' Wrap the insert in a ~15s race; on timeout restore the button and show the same message with Retry.
- **Principle:** States-and-feedback §6/§7 — busy state needs a bounded life and a designed failure; §5 error anatomy — say what failed and how to recover (offline → auto-retry/Retry).
- **Breakage risk:** Low. _cloudOffline is module-scope and readable here; ensure the early return re-enables the button (mirrors existing 16326 path).

### FLD-10 — On mobile the offline pill collapses to a bare icon whose entire explanation is a hover-only tooltip
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** CSS :2797–2801 (≤480px hides .oi-label), pill markup :5451–5457 (title attribute + cursor:help :2785)
- **Problem:** Below 480px the pill drops its 'Offline · Saved locally' label, leaving a small crossed-cloud icon; the reassuring promise — 'Your latest changes are stored on this device. They'll sync when the connection returns.' — lives only in a title attribute, which never appears on touch devices. The code's own comment (2797–2798: 'connectivity is flakiest on mobile') names exactly the audience that can't read the message. A field user sees an unexplained warning glyph while saving their first job and has no way to learn their data is safe — the trust moment the pill exists for.
- **Evidence:** 2799–2801: `@media (max-width: 480px) { #offlineIndicator .oi-label { display: none; } }`. 5451: explanation only in `title="..."`; 2785 `cursor: help` — both pointer-only affordances.
- **Recommendation:** Make the pill tappable on touch: onclick, show a small anchored popover (or a ≥6s toast) with the full saved-locally/sync promise and, ideally, the pending count from loadPendingPush().length ('2 jobs waiting to sync'). Keep the compact icon.
- **Principle:** gestures-touch / ux-pitfalls — hover-only affordances are invisible on touch; NN/g system status must be readable, not just present; touch target for the new tap ≥44px.
- **Breakage risk:** New popover needs light-mode overrides (theme-parity) and its copy should match the Resources guide's offline description (resources-sync). Ensure the tap target doesn't collide with the adjacent usage badge in the 480px header.

### FLD-11 — Tailwind Play CDN runtime JIT in production taxes boot and every re-render on the 25k-line DOM
`severity: medium` · `kind: improvement` · `effort: L` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** index.html:39 (cdn.tailwindcss.com/3.4.16), tailwind.config :89–98; render fns rewriting innerHTML throughout (e.g. renderDashboard 10872–10887)
- **Problem:** The Play CDN compiles utility CSS at runtime: at boot it scans the entire 25,809-line document on the main thread of a mid-range Android phone, and its MutationObserver re-scans class attributes after every innerHTML rewrite — which is how every render function in this app updates the screen. That is recurring main-thread work stacked onto each interaction (INP budget 200ms), plus ~100KB gz of render-blocking script on the critical path (see FLD-2), for CSS that never changes between deploys. Tailwind's own docs scope the Play CDN to development.
- **Evidence:** Line 39 is the standard Play CDN script include; there is no build step in the repo (single index.html, serve.py/serve.sh only). All dashboard/calculator renderers assemble class-laden template strings (e.g. 12103–12141) that the observer must re-scan on injection.
- **Recommendation:** Pre-compile once: run Tailwind CLI over index.html at deploy time and inline the generated static stylesheet, dropping the runtime script. Classes are authored statically in template literals, so the content scanner will find them; audit for any string-concatenated class names and safelist those.
- **Principle:** implementation.md §7 — INP ≤200ms, yield main thread, keep critical path small; 'test on a real device'.
- **Breakage risk:** Highest of any finding here: a missed dynamically-built class (e.g. conditional color fragments) silently loses styling in one theme or state. Requires a full theme-parity sweep and visual regression pass across dashboard/calculator/modals. Netlify build step conflicts with the current 'manual deploy of a static file' workflow.

### FLD-12 — Reconnect success is never affirmed — the pill just disappears while queued jobs sync silently
`severity: low` · `kind: improvement` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** markCloudOk :21430–21435, flushPendingPush :21763–21776 (silent pushes :21773), online handler :21466
- **Problem:** After an offline save, the user was told (fleetingly) 'Saved locally — cloud sync failed.' When the connection returns, flushPendingPush pushes with silent=true and markCloudOk merely removes the pill. The open trust question — 'did my quote make it to the cloud before I left the jobsite?' — is answered only by the absence of a warning, which users don't reliably notice. The one moment that would close the offline loop with confidence has no signal.
- **Evidence:** 21773: `await pushJobToCloud(job, true)` — silent. 21430–21434: markCloudOk only flips the class and clears the timer; no user-facing message anywhere in the reconnect path.
- **Recommendation:** In flushPendingPush, when the queue was non-empty and fully drains, fire one toast: 'Back online — 2 jobs synced.' (Depends on FLD-4's ≥4s duration.) Keep it to the transition moment only; no persistent badge.
- **Principle:** States-and-feedback §1 — success state: brief, then settle; optimistic-UI loop step 3 (reconcile) deserves acknowledgment when the user was explicitly warned of the failure.
- **Breakage risk:** Minimal — guard so background drains on visibilitychange don't toast repeatedly (only when items actually pushed). Copy should match the Resources guide's sync description (resources-sync).

## Section: Job photos — cover thumbnail + install gallery (capture, upload, display, downstream use)

**Summary:** Photos sit just off the first-login→first-priced-job spine, but they are the feature a field contractor reaches for at the house ("let me shoot the openings before I quote"), and the current design fights that moment. There are two parallel photo models — a single branded cover (dashPhotoInput → blur + baked title, 640px) and a 24-photo install gallery (jdGalleryInput → fan carousel + lightbox) — and nothing in the UI explains which is which: the dashboard tile only offers the cover path, which irreversibly blurs and overwrites the user's photo, while the real gallery hides behind an 11px "+ Add photos" link inside Job Details. Upload feedback is a single 1.6-second toast channel where later messages overwrite earlier ones, so on LTE a 24-photo batch runs for a minute with no progress, and quota/size failures are literally replaced by a false "photos added" success. Photos also never reach any customer-facing artifact (quote PDF, #/q/ viewer, e-sign snapshot all photo-free), and a deterministic draft-cover storage path can silently swap or destroy covers across jobs. The engineering underneath (offline base64 fallback, background migration, carry-forward in save flows, keyboard-capable lightbox) is genuinely solid — the failures are almost all at the seam where that machinery meets the user.

**Strengths (do not regress):**
- Photo carry-forward is explicitly defended in the two highest-traffic save flows: confirmSaveJob (15199–15214) and writeDraftJob (15451–15463) both copy photos/photoPath/photosUpdatedAt off the prior record with comments explaining why — the STATE-rebuild field-drop hazard from the project memory is handled here and later phases must not regress it.
- Offline-first fallback done right at the storage layer: gallery and cover uploads fall back to inline base64 when offline/unsigned (12909, 12989) and migrateBase64Photos (12917–12954) quietly promotes them to Storage on next login — a field contractor with no signal never loses a capture outright.
- The lightbox already has the keyboard support the PDF preview lacks (MOB-10): Escape closes, arrows navigate (13182–13186), and there is a careful stale-async guard (13209–13213) that keys on entry identity so a delete can't let a late signed-URL resolve paint the wrong photo.
- Gesture discipline in the fan carousel: touch-action pan-y plus an explicit vertical-intent bail (13125) lets page scroll pass through while horizontal drags scrub the fan, and click-vs-drag suppression (13101–13106) prevents accidental lightbox opens — exactly the pattern gestures-touch.md prescribes.

### PHOTO-1 — 'Upload photo' silently destroys the user's photo: blur + job title are baked in, original discarded
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Dashboard tile action + Job Details cover button; index.html 13650–13666 (handler), 13664 composeJobThumbnail(dataUrl,…,3), 12817–12830 compressJobPhoto (640px), 13887/13979 jdPhoto routes to the same pipeline, 12733–12736 button label 'Upload photo'
- **Problem:** A contractor at the house taps 'Upload photo' expecting their before-photo to be stored. Instead the app downscales it to 640px, blurs it (radius 3), overlays the job name + subtitle, and stores ONLY that composite (saveJobPhoto 12892–12914, upsert over uid/jobid.jpg). The raw photo is never kept, there is no preview or undo, and nothing in the UI warns that this is a 'branding' action. Bonus symptom: rename the job later and the tile still shows the OLD name baked into pixels next to the card's new name text.
- **Evidence:** 13661–13664: `let thumb = dataUrl; try { thumb = await composeJobThumbnail(dataUrl, title, subtitle, 3) }` then 13665 `await saveJobPhoto(id, thumb)` — the un-branded dataUrl is discarded. 12902 uploads with `{ upsert: true }` over the fixed cover path. The only disclosure of this behavior is in anchor-resources.json line 458, not in the UI.
- **Recommendation:** Stop baking: store the compressed original and render the title as an HTML/CSS overlay on the tile (keeps tiles consistent, photo recoverable, titles never stale). If baking stays, show a 1-step preview ('Use as cover — it will be styled like this') before committing, and keep the label honest: 'Set cover image'.
- **Principle:** Trust/no silent destructive transforms (trust-ethics.md); NN/g match between system and real world + user control & freedom
- **Breakage risk:** Dashboard tile look changes (title overlay vs baked); Grok AI thumbnails use the same composeJobThumbnail path and must keep working; resources-sync must update anchor-resources.json lines 275/458; theme-parity pass needed on any new overlay text.

### PHOTO-2 — Two parallel photo systems with zero explanation — the discoverable action leads to the wrong one
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Dashboard card overlay 12732–12737 (cover only), Job Details 13887 (cover) vs 13034 ('+ Add photos' gallery link), system comments 12956–12963 admit they're separate
- **Problem:** The in-the-field job ('attach before-photos to this job') maps to the gallery, but the only photo affordance surfaced on the dashboard tile is the cover pipeline ('Upload photo' / 'Generate with Grok'). The gallery exists only inside Job Details as an 11px gold text link below the fold (after pricing/specs). Users will set a cover expecting a gallery, get one blurred branded image, and conclude the app holds one photo per job. The one-cover/N-gallery model is never stated anywhere in the UI.
- **Evidence:** dashJobCard's overlay offers exactly two actions, both cover-writers (12733–12737). jobGalleryHTML's add action is `class="text-[11px] font-bold …">+ Add photos</button>` (13034). No copy anywhere distinguishes 'cover' from 'installation photos'; the jd-photo tooltip says generically 'Upload a job photo' (13887).
- **Recommendation:** Unify the entry point: dashboard tile tap (or its 'Photos' action) opens the Job Details gallery, with 'Set cover' as a secondary action on any gallery photo (cover becomes a designated gallery photo, killing the two-model split entirely). At minimum, rename actions to 'Set cover image' vs 'Add job photos' and add a one-line hint in the gallery header.
- **Principle:** One coherent mental model / consistency (NN/g); progressive disclosure should hide detail, not the primary path (ux-pitfalls.md §1)
- **Breakage risk:** Dashboard card interaction changes must not break data-dash-details/load/del delegation (13540–13551); cover-photo cloud field (photoPath) consumed by tiles and sync — keep it populated; resources guide must be re-synced.

### PHOTO-3 — Multi-photo upload on LTE: no progress, button stays live, and failure toasts are overwritten by a false success
`severity: high` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** jdGalleryInput change handler 13670–13685; addJobGalleryPhotos 12969–12996; toast() 14703–14709
- **Problem:** Picking 24 photos on LTE means: one 'Adding 24 photos…' toast that vanishes after 1.6s, then up to a minute of dead silence (sequential compress loop 13681, then sequential awaited uploads 12975–12990) with no progress indicator, no disabled Add button, and no per-file results. Worse, the toast system is a single element with clearTimeout-replace semantics, so (a) the 'Some images were too large… skipped' warning (13677) is erased 0ms later by 'Adding N photos…' (13679); (b) if localStorage quota fails, saveJobs' error toast (8372) is erased by the unconditional '`N` photos added' (13684) — a false success after nothing persisted (12992 ignores saveJobs' return value); (c) an offline upload silently falls back to base64 (12987–12989) and still reports 'photos added' with no hint they haven't synced. Pick 30 photos and all 30 are compressed on the main thread before the 24-cap discards the last 6 (12974–12976).
- **Evidence:** 14708: toast auto-dismisses at 1600ms (Material snackbar minimum is ~4s). 13677→13679: back-to-back toast() calls, second replaces first. 12992: `saveJobs(jobs);` return ignored; 13684 then toasts success. 12976: cap enforced only inside the add loop, after the handler compressed every file.
- **Recommendation:** Render upload state inline in the gallery section (doctrine: >10s waits need determinate progress — 'Uploading 7/24…' with per-file failure list), disable #jdAddPhotos while a batch runs, check the saveJobs result before claiming success, enforce the 24-cap at pick time ('You can add 12 more'), and make toast() queue instead of clobber.
- **Principle:** states-and-feedback.md §2 (>10s → determinate progress; never critical info only in a toast, §4) and §4 toast min-duration/queueing (Material)
- **Breakage risk:** toast() is used app-wide — queueing changes timing everywhere (verify save/draft flows still feel snappy); inline progress UI needs light-mode overrides and a resources-sync note for the 24-photo/15MB limits.

### PHOTO-4 — Deterministic draft cover path silently swaps or destroys cover photos across jobs
`severity: high` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** saveJobPhoto path build 12899 + upsert 12902; draftIdFor 21726–21729 (fixed per-account draft uuid, passes isUuid 21717–21720); confirmSaveJob carries photoPath without copying 15206; deleteJob hard-removes the shared object 15584–15585
- **Problem:** A signed-in user's working draft always has the SAME id (00000000-0000-4000-8000-<uid tail>). Set a cover on a draft → object stored at uid/<draft-id>.jpg. Promote the draft (new random job id, photoPath carried as-is). Start the next quote, set a cover on the new draft → upsert OVERWRITES the same storage object, so the previously saved job's tile now shows the new draft's photo (or a stale cached one until the 50-min signed-URL cache rolls). Delete either job and 15584 removes the shared object, breaking the other's cover. The exact hazard the saveAsNewVersion comment (15353–15355) guards against exists un-guarded in the everyday draft-promotion flow.
- **Evidence:** 12899: `const path = currentUser.id + "/" + j.id + ".jpg"` — for a draft, j.id is the deterministic draftIdFor value; 12902 `{ upsert: true }`; 15206 `if (_photoSrc.photoPath) job.photoPath = _photoSrc.photoPath;` (no storage copy); gallery paths dodge this only because they embed Date.now() (12982).
- **Recommendation:** On draft promotion, copy the storage object to uid/<new-job-id>.jpg (sb.storage.copy) and repoint photoPath; or key cover uploads with a random token like the gallery does. Until fixed, at least stop offering cover upload on draft cards.
- **Principle:** Data integrity is a UX trust property (trust-ethics.md); WHAT-COUNTS 'trust problems'
- **Breakage risk:** Touches the cloud-sync draft model (reference_draft_cloud_sync invariants) — the deterministic draft id itself must NOT change; only the cover object key. Verify migrateBase64Photos still targets the right path.

### PHOTO-5 — 'Save as new version' silently strips every photo from the new version
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** saveAsNewVersion 15352–15357; toast 15377 claims plain success
- **Problem:** Version a job that carries 20 install photos and a cover: v2 is created with `newJob.photos = []` and all cover fields deleted (15356–15357), the toast says only 'Saved as <name> v2', and the user discovers an empty 'No installation photos yet' gallery later — looking exactly like data loss. The code comment explains WHY paths can't be shared (delete-collision), but the user is never told, and no copy is made.
- **Evidence:** 15356–15357: `newJob.photos = []; delete newJob.photosUpdatedAt; delete newJob.photoPath; delete newJob.photo; delete newJob.photoUpdatedAt;` — unconditional, silent.
- **Recommendation:** Best: storage-copy the objects to the new job id so versions keep their documentation. Cheap interim: when the base job has photos, append to the toast/confirm 'Photos stay on the original job' so the emptiness is expected.
- **Principle:** Visibility of system status; never silently drop user data (NN/g heuristic 1; states-and-feedback.md §1)
- **Breakage risk:** Storage-copy adds latency + storage cost per version; must keep the delete-collision guarantee (never share paths). Toast-only fix risks nothing.

### PHOTO-6 — Photos are a dead-end store: they never reach the quote PDF, public quote page, or e-sign packet
`severity: medium` · `kind: improvement` · `effort: L` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Quote/PDF builders 15604–16114 and sign snapshot builder 16148–16334 contain zero photo references (grep verified: no 'photo' hits 15600–17700 except the unrelated feedback system at 17761+; none in the #/q// sign viewers 3739–4340)
- **Problem:** The gallery empty-state pitch ('document the install and keep records', 13030) and the Pro-plan pitch ('photo uploads', anchor-resources.json 401) imply photos do work for the business, but they surface nowhere except the dashboard: not in the customer quote, not on the shared #/q/ page, not in the e-sign snapshot, not in a materials/install doc. For a contractor, before/after photos attached to the signed quote are exactly the artifact that wins disputes — the highest-value downstream use is missing, which caps the feature's worth and the honesty of the pitch.
- **Evidence:** buildSignSnapshotForJob (16164+) and the snapshot schema (16315) carry pricing fields only; the public viewer reads quote.snapshot (4269) with no photo branch; jd 'Documents' grid (13925–13930) offers four photo-less docs.
- **Recommendation:** Add an opt-in 'Include photos' page to the customer quote PDF (jsPDF addImage of the signed-URL-fetched gallery, capped ~6) and/or a one-click 'Install record (PDF)' from the gallery header. If deferred, soften the pitch so photos read as internal records.
- **Principle:** Features must feed an output the user's job needs (principles.md: design the flow to the artifact); trust-ethics.md on overselling
- **Breakage risk:** PDF size/generation time grows (base64 embeds); private signed URLs must be fetched at build time, offline builds need the base64 fallback; e-sign snapshot schema change would touch the deployed edge fn (edge-fn drift warning).

### PHOTO-7 — No offline/error state anywhere photos render — failures are silent gray boxes or a broken-image glyph
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** resolveSignedPhotoURL returns "" on any failure (12860, 12866, 12869); hydratePhotoThumbs leaves src unset (12877–12879) and marks data-photo-done so it never retries (12876); lightbox onerror just restores opacity (13216)
- **Problem:** A contractor opening a job on-site with no signal sees the fan carousel render dark empty cards and the cover tile blank — no message, no retry, indistinguishable from 'no photos'. In the lightbox, an expired/failed signed URL paints the browser's broken-image glyph at full opacity with no copy. Because hydration stamps data-photo-done="1" on the first (failed) attempt, the thumbnails stay broken until a full re-render even after connectivity returns.
- **Evidence:** 12875: selector excludes `[data-photo-done]`, and 12876 sets it before the resolve settles — a failed resolve permanently parks the img; 13216: `img.onerror = () => { img.style.opacity = "1"; }` — error rendered as success.
- **Recommendation:** On resolve failure, drop the data-photo-done stamp and swap in a small inline state ('Couldn't load — tap to retry') per states-and-feedback §3's error-vs-empty distinction; in the lightbox, show 'Photo couldn't load — check your connection' with a Retry that re-resolves (busting the 50-min cache entry).
- **Principle:** states-and-feedback.md §3: error ≠ empty; every region needs a stated failure state with Retry
- **Breakage risk:** Retry logic must not hammer createSignedUrl in a loop offline (debounce); new placeholder needs light-mode styling.

### PHOTO-8 — Lightbox a11y/ergonomics: no dialog semantics or focus management, delete parked in the worst thumb corner, 38px arrows, no swipe
`severity: medium` · `kind: flaw` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** ensureGalleryLightbox 13149–13168 (plain div, no role/aria-modal); openGalleryLightbox 13170–13175 (no focus move, no body scroll lock); CSS 3344–3348 (jdg-close top-right, jdg-del top-LEFT, mobile jdg-nav 38px)
- **Problem:** Keyboard/AT users: focus stays on the fan card behind the overlay, Tab wanders the obscured Job Details modal, and screen readers get no dialog announcement (Escape works only because of a document-level listener). Touch users: the destructive Delete button sits top-left and Close top-right — both in the anti-thumb zone per Hoober's map — the prev/next arrows shrink to 38px on mobile (below the 44px floor), and despite the fan supporting drag-to-scrub, the lightbox itself has no swipe, the one gesture every phone user tries first on a full-screen photo.
- **Evidence:** 13154–13160 markup has aria-labels on buttons but no role="dialog"/aria-modal on #jdgLightbox; 13172 `classList.add("open")` with no focus() call and no previous-focus restore in closeGalleryLightbox (13176–13181); 3348 `@media (max-width:640px){ .jdg-nav { width:38px; height:38px; } }`.
- **Recommendation:** Add role="dialog" aria-modal="true", move focus to the close button on open and restore on close, lock body scroll while open; bump mobile arrows to ≥44px; reuse the fan's pointer-drag code for a left/right swipe in the stage; keep Delete but move it into a bottom action bar in the thumb zone.
- **Principle:** accessibility.md dialog focus rules; mobile-patterns.md §1 thumb zones + §2 44–48px targets
- **Breakage risk:** Focus-restore must not fight the Job Details modal's own focus handling; scroll-lock can shift the page (compensate scrollbar); swipe must not break the stale-resolve guard at 13209–13213.

### PHOTO-9 — The gallery's only entry point is an 11px text link, and the empty state has no direct action
`severity: medium` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** jobGalleryHTML 13030 (jd-fan-empty copy, no button) and 13034 ('+ Add photos' text-[11px], no min-height); wiring 13088
- **Problem:** The primary act of the whole gallery — adding photos — is a text link roughly 16–20px tall (11px bold font, no padding), far under the 44px touch floor, easy to miss and hard to hit with a work-gloved thumb. The empty state ('No installation photos yet — add a few to document the install and keep records', 13030) teaches but provides no pathway: it isn't tappable and contains no button, sending the eye back up to hunt for the small link.
- **Evidence:** 13034: `<button type="button" id="jdAddPhotos" class="text-[11px] font-bold text-[#c9a558] …">+ Add photos</button>` — no size utilities; 13030 renders a plain div with dashed border, no click handler attached anywhere (13084–13088 wires only #jdAddPhotos).
- **Recommendation:** Make the empty state itself the button — full-width dashed drop-zone style with a camera icon and 'Add installation photos' — and give #jdAddPhotos ≥44px hit area via padding (visual size can stay small).
- **Principle:** states-and-feedback.md §3 (empty state must provide the direct pathway); mobile-patterns.md §2 (extend hit area with padding)
- **Breakage risk:** New tappable empty state needs a light-mode variant; ensure the drop-zone click doesn't collide with the fan's pointer handlers when photos exist (they're mutually exclusive branches, 13021–13030).

### PHOTO-10 — No photo capture at the moment of need — the field flow demands a 5-step detour after saving
`severity: medium` · `kind: improvement` · `effort: M` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Save Job modal (openSaveJobModal 15070+, no photo affordance in its form fields 15178–15197); calculator screen has no photo control; only path is Dashboard→card→Details→scroll→'+ Add photos' (13034)
- **Problem:** The natural field sequence is: measure → price in the calculator → save → shoot the openings. But photos can only be attached from the dashboard's Job Details modal, so the contractor standing at the house must save, navigate to the dashboard, find the card, open details, scroll past pricing/specs, and hit the small link. Nothing in the save confirmation or calculator ever suggests photos exist, so the feature that most needs the on-site moment is furthest from it.
- **Evidence:** confirmSaveJob's job object (15178–15197) has no photo fields from the form (they're only carried from prior records, 15199–15214); the save modal markup (6244 region) and the calculator rail contain no photo input; the sole gallery trigger is 13088.
- **Recommendation:** Add an 'Add photos' affordance to the save-success moment (toast action or a row in the Save Job modal that stages photos and attaches them post-save via addJobGalleryPhotos(id,…)), or a camera button on the calculator's live recap when a job is loaded.
- **Principle:** Bring the action to the moment of need — minimize interaction cost (NN/g; principles.md flow-first)
- **Breakage risk:** Staged photos before the job id exists must respect the draft/uuid rules (12980) or they'll base64-bloat; save modal is on the critical first-job path — keep it one-decision-per-step (an optional collapsed row, not a new required field).

### PHOTO-11 — accept='image/png,image/jpeg' is needlessly narrow and per-file read errors vanish silently
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Inputs 5347–5348; per-file catch swallows errors 13681; generic 'Couldn't read that image' 13668
- **Problem:** iOS Safari saves the phone flow — it shows the Library/Take Photo/Choose sheet even without a capture attribute and transcodes HEIC→JPEG at pick time — so the primary iPhone path works. But the filter still blocks WebP/HEIC files on desktop pickers (HEIC greyed out in Chrome/Edge on Mac, so a contractor pulling customer-emailed photos hits a wall), and anything that slips through but fails decode is dropped without a word in the gallery loop: 13681's `catch (_) {}` discards the file, then the success toast reports only the survivors' count with no mention of the failures. Everything is re-encoded to JPEG by canvas anyway (12830), so the narrow accept buys nothing.
- **Evidence:** 5347–5348: `accept="image/png,image/jpeg"` on both inputs, no capture attribute; 13681: `for (const f of okFiles) { try { dataUrls.push(await compressJobPhoto(f, 1400, 0.82)); } catch (_) {} }` — silent per-file drop.
- **Recommendation:** Broaden to accept="image/*" (canvas re-encode makes the format moot wherever the browser can decode), count decode failures and say so ('2 photos couldn't be read'), and consider capture="environment" on a dedicated 'Take photo' secondary action rather than the main input (keeping library access).
- **Principle:** Robustness/smart defaults (forms-and-inputs.md): accept broadly, normalize internally; GOV.UK error specificity (states-and-feedback.md §5)
- **Breakage risk:** image/* admits formats older browsers can't decode — the existing catch already handles that, but the new failure copy must be queued so it isn't toast-clobbered (see PHOTO-3).

### PHOTO-12 — 'Generate AI thumbnail' replaces an existing uploaded cover with no confirmation — and spends a paid credit doing it
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** generateJobThumbnail 13370–13398 (no existing-photo check); saveJobPhoto upsert 12899–12904 destroys the prior object; buttons at 12737 (card) and 13888 (Job Details, directly under the cover)
- **Problem:** The ✨ button sits one tap from the cover in both surfaces. If the contractor already uploaded a real house photo, tapping it (curiosity taps are likely — it's the shiniest control in the modal) irrevocably overwrites their photo with an AI-generated Florida house AND burns one of a metered allowance (trial/starter get 10 per cycle per the resources guide). No 'replace current photo?' guard, no undo — the storage object is upserted at the same path.
- **Evidence:** 13372–13395: loads the job, generates, composites, `await saveJobPhoto(jobId, thumb)` — at no point checks `job.photoPath || job.photo`; 12902 `{ upsert: true }`.
- **Recommendation:** When a cover exists, confirm with the consequence named: 'Replace the current photo with an AI image? Uses 1 image credit. The current photo can't be recovered.' (One dialog, only in the has-photo case — no habituation risk.)
- **Principle:** states-and-feedback.md §4: reserve blocking confirmation for truly irreversible actions and name the consequence — this is exactly that case
- **Breakage risk:** None meaningful; keep the _aiThumbCache retry path (13377–13389) working when the user confirms.

### PHOTO-13 — Deleting a job destroys up to 25 photos permanently but the confirm never says so
`severity: low` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** Confirm copy at 13550 and 13975 ('Delete this job? This can't be undone.'); hard storage removal 15584–15589; lightbox per-photo confirm 13226
- **Problem:** For a contractor, install photos are warranty/liability records with a multi-year shelf life. deleteJob synchronously hard-removes the cover and every gallery object from Storage, yet the confirm dialog names only 'this job'. A user pruning old quotes has no idea they're also shredding their only install documentation. The single-photo delete in the lightbox uses a blocking confirm() for a routinely reversible-feeling act, the pattern the doctrine says to replace with instant-delete + Undo.
- **Evidence:** 15584–15589: `sb.storage.from(PHOTO_BUCKET).remove([target.photoPath])` and `.remove(gp)` fire immediately on confirm; the confirm strings (13550, 13975) contain no photo mention.
- **Recommendation:** When target has photos, extend the confirm: 'Delete this job and its 14 photos? This can't be undone.' For the lightbox, switch to remove-now + 'Photo removed — Undo' toast (defer the storage .remove() until the toast expires).
- **Principle:** states-and-feedback.md §4: undo over confirm for reversible deletes; name the specific consequence for irreversible ones
- **Breakage risk:** Undo requires deferring the storage remove — ensure a page unload mid-toast still completes or abandons consistently; copy change requires no parity work.

### PHOTO-14 — Gallery chrome has no light-mode overrides: near-invisible counter, off-token empty state
`severity: polish` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** CSS 3326 (.jd-fan-empty), 3328 (.jd-fan-arrow), 3333 (.jd-fan-counter #94a3b8); light overrides exist only for .jd-photo/.dash-thumb at 3495–3505
- **Problem:** In light mode the fan counter renders #94a3b8 11px bold on white (~2.9:1 — fails WCAG 4.5:1), the empty-state's dashed #1e293b border reads as a heavy near-black outline against the light card, and the arrows keep dark-theme rgba fills. The lightbox itself is correctly theme-agnostic (dark overlay is right for photos), but the in-modal gallery chrome wasn't given the opt-in light treatment the project mandates for every visible component.
- **Evidence:** grep of `data-theme="light"` across fan/jdg classes returns nothing; nearest overrides stop at .jd-photo-empty (3505).
- **Recommendation:** Add [data-theme="light"] overrides: counter → #475569, jd-fan-empty border → #d8dde6 with #64748b text, arrows → light-gold-on-white treatment mirroring .jd-doc-btn's palette. Then run the theme-parity skill as the memory rule requires.
- **Principle:** Project theme-parity doctrine (dark primary, light = explicit overrides); WCAG 1.4.3 contrast
- **Breakage risk:** Pure additive CSS; verify dark mode untouched and fan-card shadows still read on light cards.

### PHOTO-15 — The install gallery is invisible to the Resources guide — users can't learn the feature exists
`severity: polish` · `kind: flaw` · `effort: S` · `verdict: CONFIRMED (gap section — single-pass)`

- **Where:** anchor-resources.json documents only the cover system (lines 275, 451–476: blur/branding, 12MB cap, AI caps); zero hits for gallery/installation photos/24-photo limit/lightbox in anchor-resources.json and anchor-learn.json
- **Problem:** The guide teaches the branded cover thumbnail in detail but never mentions the 24-photo install gallery, its 15MB per-file limit, the fan carousel, or the lightbox — so the in-app help actively reinforces the one-photo-per-job misconception (PHOTO-2), and the project's own resources-sync rule (docs must track user-facing limits) is already violated for 24-photo cap, 15MB size, and offline base64 behavior.
- **Evidence:** grep -i 'gallery|installation photo|24 per job|lightbox' over anchor-resources.json returns nothing; the '12MB' cover cap IS documented (line 275) while the gallery's 15MB (13676) is not.
- **Recommendation:** Run the resources-sync skill against the gallery system: document the two-slot model, the 24-photo/15MB limits, offline fallback, and where photos do NOT appear (customer docs) — the honesty item from PHOTO-6.
- **Principle:** NN/g Help & documentation; project resources-sync doctrine (memory: run after any user-facing limit/behavior change)
- **Breakage risk:** Docs-only; keep numbers sourced from code (24 at 12974, 15MB at 13676, 12MB at 13650) so the guide doesn't drift again.