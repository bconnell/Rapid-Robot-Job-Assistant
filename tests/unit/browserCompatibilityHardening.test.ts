import { describe, expect, it } from 'vitest';
import {
  detectBrowserCompatibility,
  getBraveShieldsGuidance
} from '../../src/shared/extension/BrowserCompatibility';

describe('browser compatibility hardening', () => {
  it('falls back safely when Brave detection throws', async () => {
    const result = await detectBrowserCompatibility({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      hasChromeRuntime: true,
      hasSidePanel: false,
      brave: {
        isBrave: () => {
          throw new Error('Brave API unavailable');
        }
      }
    });

    expect(result.browserName).toBe('chrome');
    expect(result.supportsInPageAssistant).toBe(true);
  });

  it('shows Brave Shields guidance only when it is useful', () => {
    expect(
      getBraveShieldsGuidance({
        browserName: 'brave',
        fieldCount: 0,
        iframeWarnings: [],
        formDetectionFailed: true
      })
    ).toContain('Brave Shields may block');

    expect(
      getBraveShieldsGuidance({
        browserName: 'chrome',
        fieldCount: 0,
        iframeWarnings: [],
        formDetectionFailed: true
      })
    ).toBeUndefined();
  });
});
