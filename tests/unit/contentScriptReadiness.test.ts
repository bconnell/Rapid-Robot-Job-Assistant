import { describe, expect, it } from 'vitest';
import {
  classifyContentMessageFailure,
  didTabChange,
  waitForContentReadiness
} from '../../src/shared/extension/ContentScriptReadiness';

describe('content script readiness helpers', () => {
  it('detects when the active tab changed during analysis', () => {
    expect(
      didTabChange(
        { id: 10, url: 'https://jobs.example.com/apply' },
        { id: 10, url: 'https://jobs.example.com/apply' }
      )
    ).toBe(false);
    expect(
      didTabChange(
        { id: 10, url: 'https://jobs.example.com/apply' },
        { id: 10, url: 'https://jobs.example.com/other' }
      )
    ).toBe(true);
  });

  it('does not blame a tab change when the content script simply is not ready', () => {
    const failure = classifyContentMessageFailure(
      new Error('Could not establish connection. Receiving end does not exist.'),
      false
    );

    expect(failure.reason).toBe('content-not-ready');
    expect(failure.userMessage).toContain('Rebuild and reload');
  });

  it('returns the page-changed message only when the tab changed', () => {
    const failure = classifyContentMessageFailure(new Error('No tab with id 10.'), true);

    expect(failure.reason).toBe('tab-changed');
    expect(failure.userMessage).toContain('active page changed');
  });

  it('retries ping checks until the content script is ready', async () => {
    let attempts = 0;
    const response = await waitForContentReadiness(
      async () => {
        attempts += 1;
        return attempts === 3 ? { ready: true } : undefined;
      },
      5,
      1,
      async () => {}
    );

    expect(response).toEqual({ ready: true });
    expect(attempts).toBe(3);
  });
});
