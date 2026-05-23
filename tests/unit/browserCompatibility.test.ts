import { describe, expect, it } from 'vitest';
import {
  detectBrowserCompatibility,
  getBraveShieldsGuidance
} from '../../src/shared/extension/BrowserCompatibility';

describe('BrowserCompatibility', () => {
  it('detects Chrome from a Chrome user agent', async () => {
    const result = await detectBrowserCompatibility({
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      hasChromeRuntime: true,
      hasSidePanel: true
    });

    expect(result.browserName).toBe('chrome');
    expect(result.sidePanelReliability).toBe('expected');
  });

  it('detects Edge from Edg user agent', async () => {
    const result = await detectBrowserCompatibility({
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
      hasChromeRuntime: true
    });

    expect(result.browserName).toBe('edge');
    expect(result.sidePanelReliability).toBe('optional');
  });

  it('detects Brave with navigator brave API', async () => {
    const result = await detectBrowserCompatibility({
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      hasChromeRuntime: true,
      brave: { isBrave: () => true }
    });

    expect(result.browserName).toBe('brave');
    expect(result.compatibilityNotes.join(' ')).toContain('Brave Shields');
  });

  it('uses Chromium fallback for unknown Chromium-like browsers', async () => {
    const result = await detectBrowserCompatibility({
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chromium/126.0.0.0 Safari/537.36',
      hasChromeRuntime: true
    });

    expect(result.browserName).toBe('chromium');
    expect(result.supportsInPageAssistant).toBe(true);
  });

  it('shows Brave Shields guidance only when useful', () => {
    expect(getBraveShieldsGuidance({ browserName: 'brave', fieldCount: 0 })).toContain(
      'Brave Shields'
    );
    expect(getBraveShieldsGuidance({ browserName: 'chrome', fieldCount: 0 })).toBeUndefined();
    expect(getBraveShieldsGuidance({ browserName: 'brave', fieldCount: 8 })).toBeUndefined();
    expect(getBraveShieldsGuidance({ browserName: 'brave', fieldCount: 0 })).not.toMatch(
      /bypass|captcha/i
    );
  });
});
