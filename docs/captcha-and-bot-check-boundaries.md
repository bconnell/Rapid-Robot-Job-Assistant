# CAPTCHA And Bot Check Boundaries

The extension detects common manual verification patterns and pauses.

## Detected Patterns

- reCAPTCHA iframe or badge
- hCaptcha iframe or widget
- Cloudflare Turnstile
- Cloudflare challenge text
- Verify you are human
- Unusual activity
- Bot detection
- Security check
- MFA
- One-time passcode prompts
- SMS or email verification
- Login challenges

## What The Extension Does

It shows manual verification required, preserves the current workflow state, and waits for the user to continue after handling the challenge.

## What It Never Does

It does not solve CAPTCHA, click CAPTCHA, use CAPTCHA solving services, spoof user agents, rotate fingerprints, simulate fake human movement, or submit through bot checks.
