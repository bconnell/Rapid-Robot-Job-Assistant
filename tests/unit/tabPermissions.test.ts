import { describe, expect, it } from 'vitest';
import {
  buildOriginPattern,
  canOfferSitePermission,
  canRunPageCommand,
  classifyInjectionFailure,
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

  it('allows activeTab analysis on a valid page without persistent permission', () => {
    const result = preflightTab({ id: 1, url: 'https://jobs.example.com/apply/123' }, false);

    expect(result).toMatchObject({
      ok: true,
      reason: 'ready',
      canAnalyzeWithActiveTab: true,
      hasPersistentPermission: false,
      canRequestPermission: true,
      originPattern: 'https://jobs.example.com/*'
    });
    expect(result.userMessage).toContain('can be analyzed from this button');
    expect(canRunPageCommand(result)).toBe(true);
    expect(canOfferSitePermission(result)).toBe(true);
  });

  it('returns ready when the current site permission is granted', () => {
    const result = preflightTab({ id: 1, url: 'https://example.com/jobs/123' }, true);

    expect(result).toMatchObject({
      ok: true,
      reason: 'ready',
      canAnalyzeWithActiveTab: true,
      hasPersistentPermission: true,
      canRequestPermission: false,
      originPattern: 'https://example.com/*'
    });
    expect(result.userMessage).toBe('The page is ready for analysis.');
    expect(canRunPageCommand(result)).toBe(true);
    expect(canOfferSitePermission(result)).toBe(false);
  });

  it('uses specific user-facing messages for restricted or missing tab states', () => {
    expect(preflightTab(undefined, false).userMessage).toBe(
      'Open a normal web page before analyzing.'
    );
    expect(preflightTab({ id: 2, url: 'chrome://extensions' }, false).userMessage).toBe(
      'Chrome blocks extensions from analyzing this page.'
    );
    expect(preflightTab({ id: 3, url: 'about:blank' }, false).reason).toBe('restricted-url');
    expect(canRunPageCommand(preflightTab({ id: 3, url: 'about:blank' }, false))).toBe(false);
  });

  it('classifies injection failures with safe user messages', () => {
    expect(classifyInjectionFailure(new Error('Cannot access contents of url')).reason).toBe(
      'host-access-denied'
    );
    expect(classifyInjectionFailure(new Error('No tab with id: 5')).reason).toBe('tab-changed');
    expect(classifyInjectionFailure(new Error('Cannot access chrome://extensions')).reason).toBe(
      'restricted-url'
    );
    expect(classifyInjectionFailure(new Error('Unexpected failure')).reason).toBe(
      'script-injection-failed'
    );
  });
});
