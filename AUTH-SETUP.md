# Legends Auth — provider setup checklist

Concrete steps to light up each sign-in method already wired into the code.
The code ships **safe**: an enabled method whose backend isn't configured yet just shows
an inline error when used — no crash. Complete the steps below to turn each one on.

- **Supabase project:** `omfwcodoimjmbrhssvfl`
- **Dashboard:** https://supabase.com/dashboard/project/omfwcodoimjmbrhssvfl
- **OAuth callback URL (used by every provider):** `https://omfwcodoimjmbrhssvfl.supabase.co/auth/v1/callback`
- **Owning identity for all provider registrations:** `claude@mike-wolf.com`
  (project identity, not Mike's personal `mw@mike-wolf.com`)

What's enabled in `js/soma-auth-config.js` today:
`magicLink: true · emailOtp: false · password: true · phone: true · oauth: ['google']`

> ⚠️ **Deploy ordering.** `phone` and `google` are on in config but their backends aren't
> configured yet — until you finish the steps below, those options appear on the live login
> page and error when used. Either finish setup before the next deploy, or temporarily set
> `phone: false` and `oauth: []` so the committee only sees magic-link + password until you're ready.

---

## 0. One-time: redirect URLs (do this first)

Supabase → **Authentication → URL Configuration** → add every origin you sign in from:

- `https://legends-membership.netlify.app`
- `https://legends-membership.netlify.app/login.html` (covers the password-reset return)
- `http://localhost:8888` (local dev, if used)

Set **Site URL** to `https://legends-membership.netlify.app`.

---

## 1. Magic link + Email/password  ✅ no external accounts needed

Supabase → **Authentication → Providers → Email**:

- Confirm the **Email** provider is enabled (it is by default).
- Enable **"Email + password"** (turns on the password method).
- Decide **"Confirm email"**: ON = new password signups must click a confirmation link
  before first login (recommended); OFF = instant login after signup.

Sending works immediately on Supabase's built-in mailer (throttled to a few/hour — fine for
a committee). **Optional upgrade later:** Authentication → Email → SMTP Settings → point at
the VPS mail server (or a relay like Postmark/Resend) for a branded `auth@mike-wolf.com`
from-address and higher volume. Verify SPF/DKIM/DMARC first if using the VPS.

To switch magic links to **6-digit codes** instead of clickable links: edit the Magic Link
email template to use `{{ .Token }}`, then set `emailOtp: true` in config.

---

## 2. Google  — needs a Google account on `claude@mike-wolf.com`

1. **Create the Google account.** Go to accounts.google.com → create account → "use my
   existing email" → `claude@mike-wolf.com`. Confirm via the code Google emails to that mailbox.
2. **Google Cloud Console** (console.cloud.google.com, signed in as claude@):
   - Create a project, e.g. "Legends of Basketball Auth".
   - **APIs & Services → OAuth consent screen** → External → fill app name, support email
     (`claude@mike-wolf.com`), authorized domain `mike-wolf.com` / `netlify.app`. Publish (or
     add committee testers while in "testing").
   - **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
     - Authorized redirect URI: `https://omfwcodoimjmbrhssvfl.supabase.co/auth/v1/callback`
     - Copy the **Client ID** and **Client Secret**.
3. **Supabase → Authentication → Providers → Google** → enable → paste Client ID + Secret → save.

The "Continue with Google" button now works. Users sign in with their *own* Google accounts;
Google returns their email/profile to Supabase.

---

## 3. Phone / SMS  — needs an SMS gateway (the only method with a running cost)

1. Pick a provider — **Twilio** is the most common (also MessageBird, Vonage, AWS SNS).
   Create an account, get a sending number, and the API credentials (for Twilio: Account SID,
   Auth Token, Message Service SID).
2. Supabase → **Authentication → Providers → Phone** → enable → choose the provider → paste
   credentials → save. Set a sensible OTP rate limit.
3. Budget: ~1–2¢ per US text, more internationally. Each login sends one message.

Until this is done, leave `phone: false` in config so the Phone tab doesn't appear.

---

## 4. Additional OAuth (Apple / Facebook / Microsoft / GitHub…) — optional, later

Same shape as Google: create an app in that provider's developer console under
`claude@mike-wolf.com`, set the Supabase callback URL above, enable the provider in Supabase
with its client ID/secret, then add its string to `config.methods.oauth`, e.g.
`oauth: ['google', 'apple', 'facebook', 'azure']`.

Provider-specific notes:

- **Apple** — requires a paid Apple Developer account ($99/yr). "Hide My Email" gives users a
  relay address; to email those users you must register your sending domain with Apple's
  private email relay.
- **Microsoft** = provider string `azure` (Azure AD / Entra). App registered in Azure portal.
- **Facebook** — needs a Facebook account + a Meta for Developers app; Meta now requires a
  privacy-policy URL and may require business verification before going live.

---

## Recovery flow note

"Forgot password?" sends a reset email whose link returns to
`/login.html?recovery=1`; Supabase fires `PASSWORD_RECOVERY` and the login page swaps to a
"set new password" panel. Make sure `/login.html` is in the redirect allow-list (step 0).
