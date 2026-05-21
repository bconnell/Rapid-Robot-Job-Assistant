import { normalizeKey } from '../utils/Validation';

export interface CaptchaDetection {
  detected: boolean;
  reasons: string[];
}

const textPatterns = [
  'verify you are human',
  'security check',
  'unusual activity',
  'bot detection',
  'one-time passcode',
  'one time passcode',
  'sms verification',
  'email verification',
  'login challenge',
  'mfa',
  'multi-factor',
  'two-factor',
  'cloudflare'
];

export function detectCaptchaAndBotCheck(root: ParentNode = document): CaptchaDetection {
  const reasons: string[] = [];
  const doc = root instanceof Document ? root : document;
  const text = normalizeKey(doc.body?.innerText ?? doc.body?.textContent ?? '');

  if (doc.querySelector('iframe[src*="recaptcha"], .g-recaptcha, .grecaptcha-badge')) {
    reasons.push('reCAPTCHA pattern found');
  }
  if (doc.querySelector('iframe[src*="hcaptcha"], .h-captcha')) {
    reasons.push('hCaptcha pattern found');
  }
  if (doc.querySelector('iframe[src*="challenges.cloudflare.com"], [data-sitekey][data-action]')) {
    reasons.push('Cloudflare Turnstile pattern found');
  }

  for (const pattern of textPatterns) {
    if (text.includes(pattern)) {
      reasons.push(`Page text includes "${pattern}"`);
    }
  }

  return { detected: reasons.length > 0, reasons };
}
