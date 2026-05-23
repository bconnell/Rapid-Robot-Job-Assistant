export type TabCapabilityReason =
  | 'ready'
  | 'no-active-tab'
  | 'missing-tab-id'
  | 'missing-url'
  | 'unsupported-url'
  | 'restricted-url';

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
  canAnalyzeWithActiveTab: boolean;
  canRequestPermission: boolean;
  hasPersistentPermission: boolean;
  needsPersistentPermission: boolean;
  isRestricted: boolean;
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
      canAnalyzeWithActiveTab: false,
      canRequestPermission: false,
      hasPersistentPermission: false,
      needsPersistentPermission: false,
      isRestricted: false
    };
  }

  if (!tab.id) {
    return {
      ok: false,
      url: tab.url,
      reason: 'missing-tab-id',
      userMessage: 'Open a normal web page before analyzing.',
      canAnalyzeWithActiveTab: false,
      canRequestPermission: false,
      hasPersistentPermission: false,
      needsPersistentPermission: false,
      isRestricted: false
    };
  }

  if (!tab.url) {
    return {
      ok: false,
      tabId: tab.id,
      reason: 'missing-url',
      userMessage: 'Open a normal job or application page to use the assistant.',
      canAnalyzeWithActiveTab: false,
      canRequestPermission: false,
      hasPersistentPermission: false,
      needsPersistentPermission: false,
      isRestricted: false
    };
  }

  if (isRestrictedUrl(tab.url)) {
    return {
      ok: false,
      tabId: tab.id,
      url: tab.url,
      reason: 'restricted-url',
      userMessage: blockedPageMessage,
      canAnalyzeWithActiveTab: false,
      canRequestPermission: false,
      hasPersistentPermission: false,
      needsPersistentPermission: false,
      isRestricted: true
    };
  }

  const originPattern = buildOriginPattern(tab.url);
  if (!originPattern || !isSupportedWebUrl(tab.url)) {
    return {
      ok: false,
      tabId: tab.id,
      url: tab.url,
      reason: 'unsupported-url',
      userMessage: 'Open a normal job or application page to use the assistant.',
      canAnalyzeWithActiveTab: false,
      canRequestPermission: false,
      hasPersistentPermission: false,
      needsPersistentPermission: false,
      isRestricted: false
    };
  }

  if (!hasPermission) {
    return {
      ok: true,
      tabId: tab.id,
      url: tab.url,
      originPattern,
      reason: 'ready',
      userMessage:
        'The page can be analyzed from this button. You can also allow this site for smoother access.',
      canAnalyzeWithActiveTab: true,
      canRequestPermission: true,
      hasPersistentPermission: false,
      needsPersistentPermission: false,
      isRestricted: false
    };
  }

  return {
    ok: true,
    tabId: tab.id,
    url: tab.url,
    originPattern,
    reason: 'ready',
    userMessage: 'The page is ready for analysis.',
    canAnalyzeWithActiveTab: true,
    canRequestPermission: false,
    hasPersistentPermission: true,
    needsPersistentPermission: false,
    isRestricted: false
  };
}

export function canRunPageCommand(status: TabCapabilityResult | undefined): boolean {
  return Boolean(status?.ok && status.canAnalyzeWithActiveTab);
}

export function canOfferSitePermission(status: TabCapabilityResult | undefined): boolean {
  return Boolean(status?.ok && status.canRequestPermission && status.originPattern);
}

export type InjectionFailureReason =
  | 'host-access-denied'
  | 'tab-changed'
  | 'restricted-url'
  | 'script-injection-failed';

export interface InjectionFailureInfo {
  reason: InjectionFailureReason;
  userMessage: string;
  needsPersistentPermission: boolean;
}

export function classifyInjectionFailure(error: unknown): InjectionFailureInfo {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();

  if (
    lower.includes('cannot access contents') ||
    lower.includes('host permission') ||
    lower.includes('missing host permission') ||
    lower.includes('not allowed to access')
  ) {
    return {
      reason: 'host-access-denied',
      userMessage: 'Chrome blocked page access. Click Allow This Site, then retry analysis.',
      needsPersistentPermission: true
    };
  }

  if (
    lower.includes('no tab with id') ||
    lower.includes('tab was closed') ||
    lower.includes('cannot find tab') ||
    lower.includes('frame with id')
  ) {
    return {
      reason: 'tab-changed',
      userMessage: 'The page changed before analysis finished. Reload and try again.',
      needsPersistentPermission: false
    };
  }

  if (lower.includes('chrome://') || lower.includes('restricted') || lower.includes('scheme')) {
    return {
      reason: 'restricted-url',
      userMessage: blockedPageMessage,
      needsPersistentPermission: false
    };
  }

  return {
    reason: 'script-injection-failed',
    userMessage: 'The content script could not be injected. Reload the page and try again.',
    needsPersistentPermission: false
  };
}
