import type { ContentCommand } from '../content/contentMessenger';
import type { ContentPingResponse } from '../content/contentMessenger';
import {
  classifyContentMessageFailure,
  contentNotReadyMessage,
  didTabChange,
  waitForContentReadiness
} from '../shared/extension/ContentScriptReadiness';
import type {
  BackgroundMessage,
  ExtensionCommandResult,
  OpenWorkspaceResult
} from '../shared/extension/ExtensionMessaging';
import {
  buildTargetPage,
  rememberCurrentAnalyzableTab,
  validateTargetTab
} from '../shared/extension/TargetPageTracker';
import {
  buildOriginPattern,
  classifyInjectionFailure,
  isRestrictedUrl,
  preflightTab,
  type TabCapabilityResult
} from '../shared/extension/TabPermissions';
import { Logger } from '../shared/utils/Logger';

const logger = new Logger('service-worker');

chrome.runtime.onInstalled.addListener(() => {
  logger.info('Installed with local-first defaults.');
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      logger.error('Message failed', error instanceof Error ? error.message : 'Unknown error');
      sendResponse({
        ok: false,
        error: 'The command could not run. Reload the page and try again.',
        userMessage: 'The command could not run. Reload the page and try again.'
      });
    });
  return true;
});

async function handleMessage(
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<ExtensionCommandResult> {
  if (message.command === 'OPEN_SIDE_PANEL') {
    const result = await openSidePanelWorkspace();
    return {
      ok: result.opened,
      data: result,
      response: result,
      userMessage: result.userMessage,
      reason: result.reason
    };
  }

  if (message.command === 'OPEN_WORKSPACE_TAB') {
    const result = await openWorkspaceTab();
    return {
      ok: result.opened,
      data: result,
      response: result,
      userMessage: result.userMessage,
      reason: result.reason
    };
  }

  if (message.command === 'GET_CURRENT_TAB_STATUS') {
    const tabStatus = await getTabCapability();
    return {
      ok: true,
      data: tabStatus,
      response: tabStatus,
      userMessage: tabStatus.userMessage,
      needsPermission: tabStatus.needsPersistentPermission,
      originPattern: tabStatus.originPattern,
      tabUrl: tabStatus.url,
      reason: tabStatus.reason
    };
  }

  if (message.command === 'REQUEST_CURRENT_SITE_PERMISSION') {
    return {
      ok: false,
      userMessage: 'Use the Allow This Site button in the popup or side panel.',
      reason: 'permission-request-must-start-in-ui'
    };
  }

  if (message.command === 'USE_CURRENT_PAGE') {
    const tab = await getActiveTab();
    const target = tab ? await rememberCurrentAnalyzableTab(tab) : undefined;
    if (!target) {
      if (tab?.url?.startsWith(chrome.runtime.getURL(''))) {
        return {
          ok: false,
          userMessage:
            'The workspace tab needs a target job or application page. Go back to that page, open the assistant, then choose Use Current Page.',
          reason: 'workspace-tab-not-targetable'
        };
      }
      return {
        ok: false,
        userMessage: 'Open a normal job or application page before using it as the target page.',
        reason: 'target-page-not-ready'
      };
    }
    return {
      ok: true,
      data: target,
      response: target,
      userMessage: 'This page is now the target for analysis.',
      tabUrl: target.url,
      originPattern: target.originPattern,
      reason: 'target-page-set'
    };
  }

  if (message.command === 'ANALYZE_CURRENT_JOB_PAGE') {
    return sendToActiveContent('ANALYZE_JOB_PAGE');
  }

  if (message.command === 'ANALYZE_APPLICATION_FIELDS') {
    return sendToActiveContent('ANALYZE_APPLICATION_FIELDS');
  }

  if (message.command === 'FILL_APPROVED_FIELDS') {
    return sendToActiveContent('FILL_APPROVED_FIELDS', message.payload);
  }

  return { ok: false, error: `Unknown command from ${sender.id ?? 'unknown sender'}.` };
}

async function sendToActiveContent(
  command: ContentCommand,
  payload?: unknown
): Promise<ExtensionCommandResult> {
  const capability = await getTabCapability();
  if (!capability.ok || !capability.tabId) {
    return commandFailureFromCapability(capability);
  }

  const initialTab = { id: capability.tabId, url: capability.url };
  const ready = await ensureContentScriptReady(capability);
  if (!ready.ok) return ready;

  try {
    const response = await chrome.tabs.sendMessage(capability.tabId, { command, payload });
    return {
      ok: true,
      data: response,
      response,
      userMessage: 'Command completed.',
      tabUrl: capability.url,
      originPattern: capability.originPattern,
      reason: 'completed'
    };
  } catch (error) {
    const currentTab = await getActiveTab();
    const classified = classifyContentMessageFailure(error, didTabChange(initialTab, currentTab));
    return {
      ok: false,
      error: classified.userMessage,
      userMessage: classified.userMessage,
      tabUrl: capability.url,
      originPattern: capability.originPattern,
      reason: classified.reason
    };
  }
}

async function openSidePanelWorkspace(): Promise<OpenWorkspaceResult> {
  const tab = await getActiveTab();
  if (!tab) {
    return {
      opened: false,
      openedAs: 'none',
      userMessage: 'No active tab was found. Try opening the assistant workspace in a tab.',
      reason: 'no-active-tab'
    };
  }
  if (buildTargetPage(tab)) await rememberCurrentAnalyzableTab(tab);
  if (!tab.id) {
    return {
      opened: false,
      openedAs: 'none',
      userMessage: 'No active tab was found. Try opening the assistant workspace in a tab.',
      reason: 'no-active-tab'
    };
  }
  if (tab.url && isRestrictedUrl(tab.url)) {
    return {
      opened: false,
      openedAs: 'none',
      userMessage:
        'Side panel could not open on this page. Try opening the assistant workspace in a tab instead.',
      reason: 'restricted-page'
    };
  }
  if (!chrome.sidePanel?.open) {
    return {
      opened: false,
      openedAs: 'none',
      userMessage:
        'Side panel could not open in this Chrome window. Try opening the assistant workspace in a tab instead.',
      reason: 'side-panel-api-unavailable'
    };
  }
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    return {
      opened: true,
      openedAs: 'side-panel',
      userMessage: 'Assistant workspace opened in the side panel.',
      reason: 'side-panel-opened'
    };
  } catch {
    return {
      opened: false,
      openedAs: 'none',
      userMessage:
        'Side panel could not open in this Chrome window. Try opening the assistant workspace in a tab instead.',
      reason: 'side-panel-open-failed'
    };
  }
}

async function openWorkspaceTab(): Promise<OpenWorkspaceResult> {
  try {
    const tab = await getActiveTab();
    const remembered = tab ? await rememberCurrentAnalyzableTab(tab) : undefined;
    await chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/sidepanel.html') });
    return {
      opened: true,
      openedAs: 'tab',
      userMessage: remembered
        ? 'Assistant workspace opened in a tab with this page selected for analysis.'
        : 'Assistant workspace opened in a tab. Open the job or application page, then choose Use Current Page.',
      reason: remembered ? 'workspace-tab-opened-with-target' : 'workspace-tab-opened-no-target'
    };
  } catch {
    return {
      opened: false,
      openedAs: 'none',
      userMessage: 'Workspace tab could not open. Reload the extension from dist, then try again.',
      reason: 'workspace-tab-open-failed'
    };
  }
}

async function ensureContentScriptReady(
  capability: TabCapabilityResult
): Promise<ExtensionCommandResult> {
  if (!capability.tabId) return commandFailureFromCapability(capability);
  const tabId = capability.tabId;

  const initialTab = { id: tabId, url: capability.url };
  const existingPing = await pingContentScript(tabId);
  if (existingPing?.ok) return { ok: true, data: existingPing };

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/pageAnalyzer.js']
    });
  } catch (error) {
    const classified = classifyInjectionFailure(error);
    return {
      ok: false,
      error: classified.userMessage,
      userMessage:
        classified.reason === 'host-access-denied'
          ? 'Chrome blocked page access. Click Allow This Site, reload the page, then retry analysis.'
          : classified.userMessage,
      needsPermission: classified.needsPersistentPermission,
      tabUrl: capability.url,
      originPattern: capability.originPattern,
      reason: classified.reason
    };
  }

  const currentTab = await getActiveTab();
  if (didTabChange(initialTab, currentTab)) {
    return {
      ok: false,
      error: 'The active page changed before analysis finished. Open the page and try again.',
      userMessage: 'The active page changed before analysis finished. Open the page and try again.',
      tabUrl: capability.url,
      originPattern: capability.originPattern,
      reason: 'tab-changed'
    };
  }

  const readyPing = await waitForContentReadiness(() => pingContentScript(tabId), 5, 75);
  if (readyPing?.ok) return { ok: true, data: readyPing };

  return {
    ok: false,
    error: contentNotReadyMessage,
    userMessage: contentNotReadyMessage,
    tabUrl: capability.url,
    originPattern: capability.originPattern,
    reason: 'content-not-ready'
  };
}

async function pingContentScript(tabId: number): Promise<ContentPingResponse | undefined> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      command: 'PING_CONTENT_SCRIPT'
    })) as ContentPingResponse;
    return response?.ok && response.ready ? response : undefined;
  } catch {
    return undefined;
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getTabCapability(): Promise<TabCapabilityResult> {
  const tab = await getActiveTab();
  if (tab && buildTargetPage(tab)) {
    await rememberCurrentAnalyzableTab(tab);
  }
  if (tab?.url?.startsWith(chrome.runtime.getURL(''))) {
    const remembered = await getRememberedCapability();
    if (remembered) return remembered;
    return {
      ok: false,
      tabId: tab.id,
      url: tab.url,
      reason: 'unsupported-url',
      userMessage: 'The workspace tab needs a target job or application page.',
      canAnalyzeWithActiveTab: false,
      canRequestPermission: false,
      hasPersistentPermission: false,
      needsPersistentPermission: false,
      isRestricted: false
    };
  }
  const originPattern = tab?.url ? buildOriginPattern(tab.url) : undefined;
  const hasPermission = originPattern
    ? await chrome.permissions.contains({ origins: [originPattern] })
    : false;
  return preflightTab(tab, hasPermission);
}

async function getRememberedCapability(): Promise<TabCapabilityResult | undefined> {
  const target = await validateTargetTab(false);
  const originPattern = target?.originPattern;
  if (!target || !originPattern) return target;
  const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
  return validateTargetTab(hasPermission);
}

function commandFailureFromCapability(capability: TabCapabilityResult): ExtensionCommandResult {
  return {
    ok: false,
    error: capability.userMessage,
    userMessage: capability.userMessage,
    needsPermission: capability.needsPersistentPermission,
    originPattern: capability.originPattern,
    tabUrl: capability.url,
    reason: capability.reason
  };
}
