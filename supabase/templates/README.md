# Auth email templates

Branded HTML for the transactional emails Supabase Auth sends. These files are
the **source of truth**; Supabase itself stores them in the dashboard, so they
have to be pasted in by hand after a change.

| File | Dashboard template |
|------|--------------------|
| `confirm-signup.html` | Authentication → Emails → **Confirm signup** |
| `magic-link.html` | Authentication → Emails → **Magic Link** |
| `reset-password.html` | Authentication → Emails → **Reset Password** |

## How to apply

1. Supabase dashboard → Authentication → Emails → pick the template.
2. Paste the file contents into the **Message body** box (source view).
3. Set the subject line:
   - Confirm signup — `Confirm your email — Hanzi Dojo`
   - Magic Link — `Your Hanzi Dojo login link`
   - Reset Password — `Reset your Hanzi Dojo password`
4. Save, then send yourself a real one to check it.

## Notes for whoever edits these

- **Table layout + inline styles only.** Gmail strips `<style>` blocks and most
  modern CSS; this is not the app's design system and can't use its tokens.
- The only template variable used is `{{ .ConfirmationURL }}`. It appears twice
  per file (button + fallback link) — keep both.
- The Outlook button is a VML `<v:roundrect>` inside `<!--[if mso]>`; if you
  change the button label, change it in both branches.
- The logo is loaded from `https://www.hanzi-dojo.com/icon-192.png` (served from
  `public/`). Many clients block images by default, so the email must still read
  fine with it missing — don't put words in an image.
- Light-mode palette is deliberately fixed (`color-scheme: light`); Gmail and
  Outlook auto-invert dark mode unpredictably, so the card is pinned to white.
