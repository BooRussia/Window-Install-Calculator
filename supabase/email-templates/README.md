# Anchor Auth email templates

Supabase Auth emails (confirm signup, magic link, password reset) are **not**
controlled by this repo’s app code. They are edited in the Supabase Dashboard
(or Management API). The HTML files here are branded copy-paste templates.

Default Supabase mail shows **“Supabase Authentication”** as the sender and
generic body copy. Fixing that is a **two-part** dashboard change:

1. Paste these templates (body + subject)
2. Connect custom SMTP (Resend) so the **From** name is `Anchor`

Docs:
- [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend + Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)

---

## 1. Brand the templates

Open your project → **Authentication → Email Templates**:

https://supabase.com/dashboard/project/fzitkcvmbvyeilwzclme/auth/templates

For each template, set **Subject** then paste the matching HTML into **Body**:

| Dashboard template   | Subject                                      | File                 |
|----------------------|----------------------------------------------|----------------------|
| Confirm sign up      | Confirm your Anchor account                  | `confirmation.html`  |
| Magic Link           | Your Anchor sign-in link                     | `magic_link.html`    |
| Reset password       | Reset your Anchor password                   | `recovery.html`      |
| Change email address | Confirm your new Anchor email                | `email_change.html`  |

Leave the `{{ .ConfirmationURL }}` / `{{ .SiteURL }}` / `{{ .NewEmail }}`
placeholders exactly as written — Supabase fills them in.

Also confirm **Authentication → URL Configuration**:
- **Site URL** = your live Netlify domain (e.g. `https://anchorquoting.netlify.app`)
- That same origin is listed under **Redirect URLs**

The logo in these templates loads from `{{ .SiteURL }}/anchor-wordmark.png`.

---

## 2. Change the From name (required for “Anchor”, not “Supabase Auth”)

Editing the HTML alone does **not** change the sender identity. You need custom
SMTP. You already send feedback mail via Resend — reuse that for Auth:

1. In [Resend](https://resend.com): verify a domain you own (e.g. `yourdomain.com`)
2. Create an API key
3. Supabase → **Authentication → SMTP Settings** (or Email → SMTP):
   - Enable custom SMTP
   - **Sender name:** `Anchor`
   - **Sender email:** e.g. `noreply@yourdomain.com` (must be on the verified domain)
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** your Resend API key
4. Save, then raise Auth rate limits if needed under **Authentication → Rate Limits**

Until SMTP is connected, even a branded template can still arrive **From:
Supabase Auth**.

---

## 3. Quick test

1. Sign up with a fresh email (or use a plus-alias)
2. Confirm the message is From **Anchor**, subject matches above, and the gold
   button confirms into your live Site URL
3. Also spot-check magic link + password reset

---

## Optional: Management API

If you prefer not to paste in the UI, you can PATCH templates with a personal
access token from https://supabase.com/dashboard/account/tokens — see the
“Management API” section in the Email Templates docs.
