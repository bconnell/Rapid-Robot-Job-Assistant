import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectCaptchaAndBotCheck } from '../../src/shared/security/CaptchaAndBotCheckRules';

describe('detectCaptchaAndBotCheck', () => {
  it('detects fake reCAPTCHA and human verification text', () => {
    document.documentElement.innerHTML = readFileSync(
      resolve('tests/fixtures/application-forms/fake-captcha-form.html'),
      'utf8'
    );
    const result = detectCaptchaAndBotCheck(document);

    expect(result.detected).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
