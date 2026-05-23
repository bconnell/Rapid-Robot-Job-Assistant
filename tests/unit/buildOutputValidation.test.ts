import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateContentScriptText } from '../../scripts/validate-build-output.mjs';

describe('extension HTML stylesheet links', () => {
  it('keeps all extension pages linked to the deterministic shared stylesheet', () => {
    for (const page of ['options', 'popup', 'sidepanel']) {
      const html = readFileSync(`src/${page}/${page}.html`, 'utf8');
      expect(html).toContain('../shared/styles.css');
      expect(html).toContain('./main.js');
    }
  });
});

describe('content script build validation', () => {
  it('passes standalone content scripts with the readiness command', () => {
    expect(() =>
      validateContentScriptText(
        '(() => { chrome.runtime.onMessage.addListener(() => "PING_CONTENT_SCRIPT"); })();'
      )
    ).not.toThrow();
  });

  it('rejects content scripts with top-level imports', () => {
    expect(() =>
      validateContentScriptText('import { x } from "../assets/Validation.js"; console.log(x);')
    ).toThrow(/top-level import/);
  });

  it('rejects content scripts that reference shared asset chunks', () => {
    expect(() =>
      validateContentScriptText('(() => { const chunk = "../assets/Validation.js"; })();')
    ).toThrow(/asset chunks/);
  });
});
