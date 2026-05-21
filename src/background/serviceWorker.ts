import type { ContentCommand } from '../content/contentMessenger';
import { Logger } from '../shared/utils/Logger';

const logger = new Logger('service-worker');

type BackgroundCommand =
  | 'OPEN_SIDE_PANEL'
  | 'ANALYZE_CURRENT_JOB_PAGE'
  | 'ANALYZE_APPLICATION_FIELDS'
  | 'FILL_APPROVED_FIELDS'
  | 'GET_CURRENT_TAB_STATUS';

interface BackgroundMessage<T = unknown> {
  command: BackgroundCommand;
  payload?: T;
}

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
        error: 'Command failed. Check extension permissions and try again.'
      });
    });
  return true;
});

async function handleMessage(message: BackgroundMessage, sender: chrome.runtime.MessageSender) {
  if (message.command === 'OPEN_SIDE_PANEL') {
    const tab = await getActiveTab();
    if (tab?.id && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
    return { ok: true };
  }

  if (message.command === 'GET_CURRENT_TAB_STATUS') {
    const tab = await getActiveTab();
    return { ok: true, tab: { title: tab?.title, url: tab?.url } };
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

async function sendToActiveContent(command: ContentCommand, payload?: unknown) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { ok: false, error: 'No active tab found.' };
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/pageAnalyzer.js']
  });
  const response = await chrome.tabs.sendMessage(tab.id, { command, payload });
  return { ok: true, response };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
