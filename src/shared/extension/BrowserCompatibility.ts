export type BrowserName = 'chrome' | 'brave' | 'edge' | 'chromium' | 'unknown';

export interface BrowserCompatibility {
  browserName: BrowserName;
  supportsSidePanel: boolean;
  supportsInPageAssistant: boolean;
  supportsActiveTab: boolean;
  sidePanelReliability: 'expected' | 'optional' | 'unknown';
  compatibilityNotes: string[];
}

export interface BrowserDetectionInput {
  userAgent?: string;
  hasChromeRuntime?: boolean;
  hasSidePanel?: boolean;
  brave?: { isBrave?: () => boolean | Promise<boolean> };
}

const braveShieldsMessage =
  'Brave Shields may block parts of some application pages. If fields are missing, check Shields for this site. Rapid Robot Job Assistant does not change Shields settings.';

export async function detectBrowserCompatibility(
  input: BrowserDetectionInput = {}
): Promise<BrowserCompatibility> {
  const userAgent =
    input.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const hasChromeRuntime =
    input.hasChromeRuntime ?? Boolean(typeof chrome !== 'undefined' && chrome.runtime?.id);
  const hasSidePanel =
    input.hasSidePanel ?? Boolean(typeof chrome !== 'undefined' && chrome.sidePanel);
  const braveApi =
    input.brave ??
    (typeof navigator !== 'undefined'
      ? (navigator as Navigator & { brave?: { isBrave?: () => boolean | Promise<boolean> } }).brave
      : undefined);
  const isBrave = braveApi?.isBrave ? await braveApi.isBrave() : false;
  const browserName = getBrowserName(userAgent, Boolean(isBrave), hasChromeRuntime);

  return {
    browserName,
    supportsSidePanel:
      browserName === 'chrome' ? hasSidePanel : hasSidePanel && browserName === 'edge',
    supportsInPageAssistant: hasChromeRuntime,
    supportsActiveTab: hasChromeRuntime,
    sidePanelReliability:
      browserName === 'chrome' ? 'expected' : browserName === 'unknown' ? 'unknown' : 'optional',
    compatibilityNotes: buildCompatibilityNotes(browserName)
  };
}

export function getBrowserName(
  userAgent: string,
  isBrave: boolean,
  hasChromeRuntime = true
): BrowserName {
  if (isBrave) return 'brave';
  if (/Edg\//.test(userAgent)) return 'edge';
  if (/Chrome\//.test(userAgent) && /Safari\//.test(userAgent)) return 'chrome';
  if (hasChromeRuntime && /Chrom/i.test(userAgent)) return 'chromium';
  return hasChromeRuntime ? 'chromium' : 'unknown';
}

export function buildCompatibilityNotes(browserName: BrowserName): string[] {
  const notes = ['In-page assistant is the recommended live workflow surface.'];
  if (browserName === 'brave') {
    notes.push('Brave Shields may affect embedded forms, iframes, scripts, cookies, or checks.');
  }
  if (browserName === 'edge' || browserName === 'chromium') {
    notes.push('Side panel support may vary. Use the in-page assistant for live page work.');
  }
  if (browserName === 'unknown') {
    notes.push('Browser support is best effort. Use a Chromium browser for this build.');
  }
  return notes;
}

export function getBraveShieldsGuidance(input: {
  browserName: BrowserName;
  fieldCount?: number;
  iframeWarnings?: string[];
  formDetectionFailed?: boolean;
}): string | undefined {
  if (input.browserName !== 'brave') return undefined;
  const likelyBlocked =
    input.formDetectionFailed ||
    (input.fieldCount ?? 0) === 0 ||
    Boolean(input.iframeWarnings?.length);
  return likelyBlocked ? braveShieldsMessage : undefined;
}

export function browserLabel(browserName: BrowserName): string {
  if (browserName === 'chrome') return 'Chrome';
  if (browserName === 'brave') return 'Brave';
  if (browserName === 'edge') return 'Edge';
  if (browserName === 'chromium') return 'Chromium';
  return 'Unknown';
}
