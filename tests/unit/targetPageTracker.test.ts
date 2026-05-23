import { describe, expect, it } from 'vitest';
import {
  buildTargetPage,
  isRememberableTab,
  isTargetExpired
} from '../../src/shared/extension/TargetPageTracker';

describe('TargetPageTracker', () => {
  it('stores only normal analyzable web pages', () => {
    const target = buildTargetPage({
      id: 12,
      url: 'https://jobs.example.com/open-jobs/software-engineer'
    });

    expect(target?.tabId).toBe(12);
    expect(target?.originPattern).toBe('https://jobs.example.com/*');
  });

  it('refuses extension and restricted pages', () => {
    expect(
      isRememberableTab({ id: 1, url: 'chrome-extension://abc/sidepanel/sidepanel.html' })
    ).toBe(false);
    expect(isRememberableTab({ id: 2, url: 'chrome://extensions' })).toBe(false);
    expect(isRememberableTab({ id: 3, url: 'file:///C:/fake-form.html' })).toBe(false);
  });

  it('keeps fake application URLs as valid targets', () => {
    expect(isRememberableTab({ id: 4, url: 'https://careers.example.com/apply/123' })).toBe(true);
  });

  it('builds no target for assistant tab fallback pages', () => {
    expect(
      buildTargetPage({ id: 5, url: 'chrome-extension://fake/sidepanel/sidepanel.html' })
    ).toBeUndefined();
  });

  it('expires target page tracking after one day', () => {
    const now = Date.parse('2026-05-22T12:00:00.000Z');

    expect(isTargetExpired({ rememberedAt: '2026-05-22T00:30:00.000Z' }, now)).toBe(false);
    expect(isTargetExpired({ rememberedAt: '2026-05-21T11:00:00.000Z' }, now)).toBe(true);
    expect(isTargetExpired({ rememberedAt: 'not-a-date' }, now)).toBe(true);
  });
});
