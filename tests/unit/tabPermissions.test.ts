import { describe, expect, it } from 'vitest';
import {
  buildOriginPattern,
  isRestrictedUrl,
  isSupportedWebUrl,
  preflightTab
} from '../../src/shared/extension/TabPermissions';

describe('tab permission preflight', () => {
  it('builds current-origin permission patterns', () => {
    expect(buildOriginPattern('https://example.com/jobs/123')).toBe('https://example.com/*');
    expect(buildOriginPattern('http://localhost:5173/test')).toBe('http://localhost:5173/*');
    expect(buildOriginPattern('https://sub.example.com/apply')).toBe('https://sub.example.com/*');
  });

  it('detects restricted browser URLs', () => {
    expect(isRestrictedUrl('chrome://extensions')).toBe(true);
    expect(isRestrictedUrl('chrome-extension://abc/options.html')).toBe(true);
    expect(isRestrictedUrl('edge://extensions')).toBe(true);
    expect(isRestrictedUrl('about:blank')).toBe(true);
    expect(isRestrictedUrl('file:///C:/test.html')).toBe(true);
    expect(isRestrictedUrl('https://chrome.google.com/webstore/detail/example')).toBe(true);
  });

  it('detects valid web URLs', () => {
    expect(isSupportedWebUrl('https://example.com/jobs')).toBe(true);
    expect(isSupportedWebUrl('http://localhost:5173/test')).toBe(true);
    expect(isSupportedWebUrl('file:///C:/test.html')).toBe(false);
  });

  it('returns a missing permission result for a valid page without site permission', () => {
    const result = preflightTab({ id: 1, url: 'https://example.com/jobs/123' }, false);

    expect(result).toMatchObject({
      ok: false,
      reason: 'missing-permission',
      needsPermission: true,
      canRequestPermission: true,
      originPattern: 'https://example.com/*'
    });
    expect(result.userMessage).toContain('needs permission');
  });

  it('returns ready when the current site permission is granted', () => {
    const result = preflightTab({ id: 1, url: 'https://example.com/jobs/123' }, true);

    expect(result).toMatchObject({
      ok: true,
      reason: 'ready',
      hasPermission: true,
      originPattern: 'https://example.com/*'
    });
    expect(result.userMessage).toBe('The page is ready for analysis.');
  });

  it('uses specific user-facing messages for restricted or missing tab states', () => {
    expect(preflightTab(undefined, false).userMessage).toBe(
      'Open a normal web page before analyzing.'
    );
    expect(preflightTab({ id: 2, url: 'chrome://extensions' }, false).userMessage).toBe(
      'Chrome blocks extensions from analyzing this page.'
    );
    expect(preflightTab({ id: 3, url: 'about:blank' }, false).reason).toBe('restricted-url');
  });
});
