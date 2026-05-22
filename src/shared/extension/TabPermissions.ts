export type TabCapabilityReason =
  | 'ready'
  | 'no-active-tab'
  | 'missing-tab-id'
  | 'missing-url'
  | 'unsupported-url'
  | 'restricted-url'
  | 'missing-permission';

export interface TabLike {
  id?: number;
  url?: string;
  title?: string;
}

export interface TabCapabilityResult {
  ok: boolean;
  tabId?: number;
  url?: string;
  originPattern?: string;
  reason: TabCapabilityReason;
  userMessage: string;
  canRequestPermission: boolean;
  hasPermission: boolean;
  needsPermission?: boolean;
}

const blockedPageMessage = 'Chrome blocks extensions from analyzing this page.';

export function buildOriginPattern(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    return `${parsed.origin}/*`;
  } catch {
    return undefined;
  }
}

export function isRestrictedUrl(url: string): boolean {
  if (/^(chrome|chrome-extension|edge|about|file):/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) ||
      parsed.hostname === 'chromewebstore.google.com'
    );
  } catch {
    return true;
  }
}

export function isSupportedWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function preflightTab(
  tab: TabLike | undefined,
  hasPermission: boolean
): TabCapabilityResult {
  if (!tab) {
    return {
      ok: false,
      reason: 'no-active-tab',
      userMessage: 'Open a normal web page before analyzing.',
      canRequestPermission: false,
      hasPermission: false
    };
  }

  if (!tab.id) {
    return {
      ok: false,
      url: tab.url,
      reason: 'missing-tab-id',
      userMessage: 'Open a normal web page before analyzing.',
      canRequestPermission: false,
      hasPermission: false
    };
  }

  if (!tab.url) {
    return {
      ok: false,
      tabId: tab.id,
      reason: 'missing-url',
      userMessage: 'The current tab is not a normal web page.',
      canRequestPermission: false,
      hasPermission: false
    };
  }

  if (isRestrictedUrl(tab.url)) {
    return {
      ok: false,
      tabId: tab.id,
      url: tab.url,
      reason: 'restricted-url',
      userMessage: blockedPageMessage,
      canRequestPermission: false,
      hasPermission: false
    };
  }

  const originPattern = buildOriginPattern(tab.url);
  if (!originPattern || !isSupportedWebUrl(tab.url)) {
    return {
      ok: false,
      tabId: tab.id,
      url: tab.url,
      reason: 'unsupported-url',
      userMessage: 'The current tab is not a normal web page.',
      canRequestPermission: false,
      hasPermission: false
    };
  }

  if (!hasPermission) {
    return {
      ok: false,
      tabId: tab.id,
      url: tab.url,
      originPattern,
      reason: 'missing-permission',
      userMessage: 'This site needs permission before Rapid Robot Job Assistant can analyze it.',
      canRequestPermission: true,
      hasPermission: false,
      needsPermission: true
    };
  }

  return {
    ok: true,
    tabId: tab.id,
    url: tab.url,
    originPattern,
    reason: 'ready',
    userMessage: 'The page is ready for analysis.',
    canRequestPermission: false,
    hasPermission: true
  };
}
