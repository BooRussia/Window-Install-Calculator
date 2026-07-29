# Auth email templates

Supabase has no API for auth email templates — not in the Management API surface we
use, not in the MCP tools, and `supabase/config.toml` here is function-config only
(its `project_id` doesn't even match the real project ref). So these are **pasted by
hand** into the dashboard, and kept here so they're reviewable and diffable.

The `.html` files contain **no comments on purpose** — a template's whole body is
sent to customers, and anything written in it is readable by anyone who views the
message source. All the notes live in this file instead.

## Installing

1. Supabase Dashboard → **Authentication → Email Templates**
2. Pick the template (e.g. *Confirm signup*)
3. Paste the entire `.html` file into **Message body**
4. Set the subject — suggested: `Confirm your Anchor account`
5. Save, then trigger a real signup and check it on a phone

| file | dashboard template | status |
|---|---|---|
| `confirm-signup.html` | Confirm signup | done |
| — | Magic Link | still stock Supabase |
| — | Reset Password | still stock Supabase |
| — | Invite user | still stock Supabase |

To do the others, copy `confirm-signup.html` and change only the `<h1>`, the
paragraph under it, and the button label. `{{ .ConfirmationURL }}` is the correct
variable in all four.

## This does NOT make the email come from Anchor

Body and sender are separate systems. Until **custom SMTP** is configured the mail
still arrives from `noreply@mail.app.supabase.io`, and — per Supabase's docs —
Auth **refuses to deliver to any address that isn't on the project team**, so real
signups get nothing at all. It only looks fine when testing with your own address.

Fix that first, at **Authentication → Emails → SMTP Settings**. Resend fits (there's
already a `RESEND_API_KEY` in play for the feedback emails):

- host `smtp.resend.com`, port `587`, user `resend`, password = Resend API key
- sender `noreply@<your-domain>`, sender name `Anchor`
- verify that sending domain in Resend first (SPF + DKIM DNS records)
- then raise **Authentication → Rate Limits**; the default is 30 new users/hour

## Why the markup looks the way it does

- **Tables and inline CSS only.** Gmail strips `<style>` blocks; Outlook has no flex
  or grid.
- **`width:100%` under `max-width:600px`,** never a fixed `600px` — a fixed width
  doesn't shrink, and this is mostly read on a phone. Verified 0 overflow at 375px
  (card renders 351px) and capped at 600px on desktop.
- **The button is a table cell, not a styled `<a>`.** Outlook ignores padding on
  inline anchors and the tap target collapses to the text height.
- **The wordmark is text, not `anchor-wordmark.png`.** That PNG is solid gold on a
  transparent background, so it disappears against a dark header in any client that
  inverts — and images are blocked by default in much of Outlook. Text always
  renders. To use the image anyway, swap the `<span>` in the header cell for:
  ```html
  <img src="https://boorussia.github.io/Window-Install-Calculator/anchor-wordmark.png"
       width="150" alt="Anchor" style="display:block; border:0;" />
  ```
  and keep the dark cell behind it.
- **The header panel is dark on purpose** — it puts the one coloured element on a
  background we control, rather than whatever the client decides white becomes in
  dark mode.

## Contrast

Every pair measured; all clear WCAG AA.

| pair | ratio |
|---|---|
| gold `#c9a558` on navy `#0b1120` | 8.08:1 |
| tagline `#94a3b8` on navy | 7.34:1 |
| heading `#0f172a` on white | 17.85:1 |
| body `#334155` on white | 10.35:1 |
| footer `#475569` on white | 7.58:1 |
| button ink `#0b1120` on gold `#b58f4a` | 6.27:1 |
| fallback link `#755a25` on white | 6.47:1 |

The fallback link uses `#755a25` — the same value as the app's `--gold-ink`. Plain
`#c9a558` would be **2.33:1** on white, which is the bug that was fixed app-wide in
PR #158; don't reintroduce it here.
