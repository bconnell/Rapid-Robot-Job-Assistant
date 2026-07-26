import { normalizeKey } from '../utils/Validation';

export interface CaptchaDetection {
  detected: boolean;
  reasons: string[];
}

const textPatterns = [
  'verify you are human',
  'unusual activity',
  'bot detection',
  'one-time passcode',
  'one time passcode',
  'sms verification',
  'email verification',
  'login challenge',
  'mfa',
  'multi-factor',
  'two-factor'
];

const challengeContainerSelector = [
  'dialog',
  '[role="dialog"]',
  '[aria-modal="true"]',
  'form',
  '[id*="captcha" i]',
  '[class*="captcha" i]',
  '[id*="challenge" i]',
  '[class*="challenge" i]',
  '[id*="verification" i]',
  '[class*="verification" i]',
  '[id*="one-time" i]',
  '[class*="one-time" i]'
].join(',');

export function detectCaptchaAndBotCheck(root: ParentNode = document): CaptchaDetection {
  const reasons: string[] = [];
  const doc = root instanceof Document ? root : ((root as Node).ownerDocument ?? document);

  if (query(root, 'iframe[src*="recaptcha"], .g-recaptcha, .grecaptcha-badge')) {
    reasons.push('reCAPTCHA pattern found');
  }
  if (query(root, 'iframe[src*="hcaptcha"], .h-captcha')) {
    reasons.push('hCaptcha pattern found');
  }
  if (query(root, 'iframe[src*="challenges.cloudflare.com"], [data-sitekey][data-action]')) {
    reasons.push('Cloudflare Turnstile pattern found');
  }

  const candidates = collectChallengeText(root, doc);
  for (const candidate of candidates) {
    for (const pattern of textPatterns) {
      if (matchesPhrase(candidate, pattern)) {
        reasons.push(`Verification text includes "${pattern}"`);
      }
    }
  }

  return { detected: reasons.length > 0, reasons: [...new Set(reasons)] };
}

function collectChallengeText(root: ParentNode, doc: Document): string[] {
  const values: string[] = [];
  const rootElement = root instanceof Document ? root.body : root;
  const rootText = normalizeKey(rootElement?.textContent ?? '');

  if (rootText && rootText.length <= 1200) {
    values.push(rootText);
  }

  const titleText = normalizeKey(doc.title);
  if (titleText) values.push(titleText);

  const containers = Array.from(root.querySelectorAll<HTMLElement>(challengeContainerSelector));
  for (const container of containers) {
    if (!isVisible(container)) continue;
    const text = normalizeKey(container.textContent ?? '');
    if (text && text.length <= 2500) values.push(text);
  }

  return [...new Set(values)];
}

function query(root: ParentNode, selector: string): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function isVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      current.hasAttribute('hidden') ||
      current.getAttribute('aria-hidden') === 'true' ||
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function matchesPhrase(text: string, phrase: string): boolean {
  const normalized = normalizeKey(phrase);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}
