import { describe, expect, it } from 'vitest';
import type { ContentCommand } from '../../src/content/contentMessenger';
import { pingContentScript } from '../../src/content/pageAnalyzer';

describe('content messaging', () => {
  it('includes a safe ping command for readiness checks', () => {
    const command: ContentCommand = 'PING_CONTENT_SCRIPT';
    expect(command).toBe('PING_CONTENT_SCRIPT');
  });

  it('responds to ping without page text or form values', () => {
    window.history.pushState({}, '', '/fake-application');
    document.body.innerHTML = `
      <form>
        <label for="email">Email</label>
        <input id="email" value="alex@example.com" />
      </form>`;

    const response = pingContentScript();

    expect(response.ok).toBe(true);
    expect(response.ready).toBe(true);
    expect(response.name).toBe('Rapid Robot Job Assistant content script');
    expect(JSON.stringify(response)).not.toContain('alex@example.com');
    expect(JSON.stringify(response)).not.toContain('Email');
  });
});
