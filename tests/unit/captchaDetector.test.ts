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
  it('does not block a long job description that merely discusses MFA and security checks', () => {
    document.documentElement.innerHTML = `
      <html>
        <head><title>Security Engineer</title></head>
        <body>
          <main>
            <h1>Security Engineer</h1>
            <p>${'Build authentication systems and document security checks. '.repeat(40)}</p>
            <p>Experience with MFA and two-factor authentication is preferred.</p>
          </main>
        </body>
      </html>`;

    expect(detectCaptchaAndBotCheck(document).detected).toBe(false);
  });
});
