import {
  buildOriginPattern,
  isRestrictedUrl,
  isSupportedWebUrl,
  preflightTab,
  type TabCapabilityResult,
  type TabLike
} from './TabPermissions';

const targetPageKey = 'rapidRobotJobAssistant.targetPage';
const targetPageTtlMs = 24 * 60 * 60 * 1000;

export interface TargetPage {
  tabId: number;
  url: string;
  originPattern: string;
  rememberedAt: string;
}

export function isRememberableTab(
  tab: TabLike | undefined
): tab is TabLike & { id: number; url: string } {
  return Boolean(
    tab?.id &&
    tab.url &&
    isSupportedWebUrl(tab.url) &&
    !isRestrictedUrl(tab.url) &&
    buildOriginPattern(tab.url)
  );
}

export function buildTargetPage(tab: TabLike): TargetPage | undefined {
  if (!isRememberableTab(tab)) return undefined;
  const originPattern = buildOriginPattern(tab.url);
  if (!originPattern) return undefined;
  return {
    tabId: tab.id,
    url: tab.url,
    originPattern,
    rememberedAt: new Date().toISOString()
  };
}

export function isTargetExpired(
  target: Pick<TargetPage, 'rememberedAt'>,
  now = Date.now()
): boolean {
  const remembered = Date.parse(target.rememberedAt);
  return Number.isNaN(remembered) || now - remembered > targetPageTtlMs;
}

export async function rememberCurrentAnalyzableTab(
  tab: chrome.tabs.Tab
): Promise<TargetPage | undefined> {
  const target = buildTargetPage(tab);
  if (!target) return undefined;
  await chrome.storage.local.set({ [targetPageKey]: target });
  return target;
}

export async function getRememberedTargetTab(): Promise<TargetPage | undefined> {
  const result = (await chrome.storage.local.get(targetPageKey)) as Record<
    string,
    TargetPage | undefined
  >;
  return result[targetPageKey];
}

export async function clearTargetTab(): Promise<void> {
  await chrome.storage.local.remove(targetPageKey);
}

export async function validateTargetTab(
  hasPermission: boolean
): Promise<TabCapabilityResult | undefined> {
  const target = await getRememberedTargetTab();
  if (!target) return undefined;
  if (isTargetExpired(target)) {
    await clearTargetTab();
    return undefined;
  }
  try {
    const tab = await chrome.tabs.get(target.tabId);
    const url = tab.url ?? target.url;
    if (url !== target.url || !isRememberableTab({ id: tab.id, url })) {
      await clearTargetTab();
      return undefined;
    }
    return preflightTab({ id: target.tabId, url }, hasPermission);
  } catch {
    await clearTargetTab();
    return undefined;
  }
}
