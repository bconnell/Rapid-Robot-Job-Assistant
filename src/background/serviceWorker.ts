import type { ContentCommand } from '../content/contentMessenger';
import type {
  BackgroundMessage,
  ExtensionCommandResult
} from '../shared/extension/ExtensionMessaging';
import {
  buildOriginPattern,
  classifyInjectionFailure,
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
    const tab = await getActiveTab();
    if (tab?.id && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
    return { ok: true };
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

  try {
    await chrome.scripting.executeScript({
      target: { tabId: capability.tabId },
      files: ['content/pageAnalyzer.js']
    });
  } catch (error) {
    const classified = classifyInjectionFailure(error);
    return {
      ok: false,
      error: classified.userMessage,
      userMessage: classified.userMessage,
      needsPermission: classified.needsPersistentPermission,
      tabUrl: capability.url,
      originPattern: capability.originPattern,
      reason: classified.reason
    };
  }

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
  } catch {
    return {
      ok: false,
      error: 'The page may have changed during analysis. Reload and try again.',
      userMessage: 'The page may have changed during analysis. Reload and try again.',
      tabUrl: capability.url,
      originPattern: capability.originPattern,
      reason: 'content-message-failed'
    };
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getTabCapability(): Promise<TabCapabilityResult> {
  const tab = await getActiveTab();
  const originPattern = tab?.url ? buildOriginPattern(tab.url) : undefined;
  const hasPermission = originPattern
    ? await chrome.permissions.contains({ origins: [originPattern] })
    : false;
  return preflightTab(tab, hasPermission);
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
