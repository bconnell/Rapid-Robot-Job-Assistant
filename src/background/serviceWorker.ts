import type { ContentCommand } from '../content/contentMessenger';
import type { ContentPingResponse, FillApprovedFieldsResponse } from '../content/contentMessenger';
import {
  classifyContentMessageFailure,
  contentNotReadyMessage,
  didTabChange,
  waitForContentReadiness
} from '../shared/extension/ContentScriptReadiness';
import type {
  BackgroundMessage,
  ExtensionCommandResult,
  OpenAssistantResult
} from '../shared/extension/ExtensionMessaging';
import type { ApplicationSession } from '../shared/models/ApplicationSession';
import type { JobPosting } from '../shared/models/JobPosting';
import { isMeaningfulJobPosting } from '../shared/jobs/JobPostingValidation';
import { isCompleteApprovedFill } from '../shared/fill/FillApprovalRules';
import {
  isSamePageUrl,
  isValidFillPreviewArray,
  isValidFillResultArray,
  readFillApprovedFieldsRequest
} from '../shared/extension/PageCommandIntegrity';
import { ChromeStorageRepository } from '../shared/storage/ChromeStorageRepository';
import {
  ApplicationSessionRepository,
  JobPostingRepository,
  ProfileRepository
} from '../shared/storage/TypedRepositories';
import {
  buildTargetPage,
  rememberCurrentAnalyzableTab,
  validateTargetTab
} from '../shared/extension/TargetPageTracker';
import {
  buildOriginPattern,
  classifyInjectionFailure,
  isRestrictedUrl,
  isSupportedWebUrl,
  preflightTab,
  type TabCapabilityResult
} from '../shared/extension/TabPermissions';
import { Logger } from '../shared/utils/Logger';

const logger = new Logger('service-worker');
const settingsRepo = new ChromeStorageRepository();
const profileRepo = new ProfileRepository();
const jobRepo = new JobPostingRepository();
const sessionRepo = new ApplicationSessionRepository();

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
  if (message.command === 'OPEN_ASSISTANT') {
    const result = await openAssistant();
    return {
      ok: result.opened,
      data: result,
      response: result,
      userMessage: result.userMessage,
      reason: result.reason
    };
  }

  if (message.command === 'OPEN_IN_PAGE_ASSISTANT') {
    return sendToActiveContent('OPEN_IN_PAGE_ASSISTANT');
  }

  if (message.command === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    return { ok: true, userMessage: 'Options opened.', reason: 'options-opened' };
  }

  if (message.command === 'GET_ACTIVE_PROFILE') {
    const profileId = await settingsRepo.getActiveProfileId();
    const profile = profileId ? await profileRepo.get(profileId) : undefined;
    if (profileId && !profile) {
      await settingsRepo.clearActiveProfileId();
    }
    return {
      ok: true,
      data: profile,
      response: profile,
      userMessage: profile ? 'Active profile loaded.' : 'No active profile saved.',
      reason: profile ? 'active-profile-loaded' : 'active-profile-missing'
    };
  }

  if (message.command === 'SAVE_ANALYZED_JOB') {
    const job = message.payload as JobPosting | undefined;
    if (!isValidJobPayload(job) || !isMeaningfulJobPosting(job)) {
      return {
        ok: false,
        userMessage: 'The page did not contain enough reliable job information to save.'
      };
    }
    const saved = await jobRepo.saveOrUpdate({ ...job, status: 'saved' });
    return {
      ok: true,
      data: saved.job,
      response: saved.job,
      userMessage: saved.created ? 'Job saved locally.' : 'Saved job updated.',
      reason: saved.created ? 'job-saved' : 'job-updated'
    };
  }

  if (message.command === 'SAVE_APPLICATION_SESSION') {
    const payload = message.payload as Partial<ApplicationSession> | undefined;
    const pageUrl = typeof payload?.pageUrl === 'string' ? payload.pageUrl.trim() : '';
    if (!pageUrl || !isSupportedWebUrl(pageUrl)) {
      return { ok: false, userMessage: 'No valid application page was available to save.' };
    }
    const existing = await sessionRepo.findByPageUrl(pageUrl);
    const now = new Date().toISOString();

    if (payload?.fieldPreview !== undefined && !isValidFillPreviewArray(payload.fieldPreview)) {
      return { ok: false, userMessage: 'The application field preview was invalid.' };
    }
    if (payload?.fillResults !== undefined && !isValidFillResultArray(payload.fillResults)) {
      return { ok: false, userMessage: 'The application fill results were invalid.' };
    }

    const fieldPreview = payload?.fieldPreview ?? existing?.fieldPreview ?? [];
    const fillResults = payload?.fillResults ?? existing?.fillResults ?? [];
    const manualVerificationRequired =
      typeof payload?.manualVerificationRequired === 'boolean'
        ? payload.manualVerificationRequired
        : (existing?.manualVerificationRequired ?? false);
    const requestedStatus = isApplicationSessionStatus(payload?.status)
      ? payload.status
      : (existing?.status ?? 'draft');
    const status = deriveApplicationSessionStatus(
      requestedStatus,
      fieldPreview,
      fillResults,
      manualVerificationRequired
    );
    const job = isValidJobPayload(payload?.job) ? payload.job : existing?.job;
    const session: ApplicationSession = {
      id: existing?.id ?? crypto.randomUUID(),
      pageUrl,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      fieldPreview,
      fillResults,
      manualVerificationRequired,
      notes:
        typeof payload?.notes === 'string'
          ? payload.notes.slice(0, 20000)
          : (existing?.notes ?? ''),
      status,
      submittedByUser: status === 'submitted-by-user',
      job,
      jobPostingId:
        typeof payload?.jobPostingId === 'string' && payload.jobPostingId.length <= 200
          ? payload.jobPostingId
          : (job?.id ?? existing?.jobPostingId)
    };
    await sessionRepo.save(session);
    return {
      ok: true,
      data: session,
      response: session,
      userMessage: 'Application session saved locally.',
      reason: 'application-session-saved'
    };
  }

  if (message.command === 'GET_RECENT_SESSION_FOR_PAGE') {
    const pageUrl = (message.payload as { pageUrl?: string } | undefined)?.pageUrl;
    const session =
      typeof pageUrl === 'string' && isSupportedWebUrl(pageUrl)
        ? await sessionRepo.findByPageUrl(pageUrl)
        : undefined;
    return {
      ok: true,
      data: session,
      response: session,
      userMessage: session ? 'Application session loaded.' : 'No saved session for this page.',
      reason: session ? 'application-session-loaded' : 'application-session-missing'
    };
  }

  if (message.command === 'SAVE_APPLICATION_NOTES') {
    const payload = message.payload as { pageUrl?: string; notes?: string } | undefined;
    if (!payload?.pageUrl || !isSupportedWebUrl(payload.pageUrl)) {
      return { ok: false, userMessage: 'No valid application page was selected.' };
    }
    const existing = await sessionRepo.findByPageUrl(payload.pageUrl);
    if (!existing) return { ok: false, userMessage: 'No saved application session found.' };
    const updated = {
      ...existing,
      notes: typeof payload.notes === 'string' ? payload.notes.slice(0, 20000) : '',
      updatedAt: new Date().toISOString()
    };
    await sessionRepo.save(updated);
    return {
      ok: true,
      data: updated,
      response: updated,
      userMessage: 'Application notes saved locally.',
      reason: 'application-notes-saved'
    };
  }

  if (message.command === 'OPEN_SIDE_PANEL') {
    const result = await openAssistant();
    return {
      ok: result.opened,
      data: result,
      response: result,
      userMessage: result.userMessage,
      reason: result.reason
    };
  }

  if (message.command === 'OPEN_WORKSPACE_TAB') {
    const result = await openAssistantTab();
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
            'The assistant tab needs a target job or application page. Go back to that page, open the assistant, then choose Use This Page.',
          reason: 'assistant-tab-not-targetable'
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
  const fillRequest =
    command === 'FILL_APPROVED_FIELDS' ? readFillApprovedFieldsRequest(payload) : undefined;
  if (command === 'FILL_APPROVED_FIELDS' && !fillRequest) {
    return {
      ok: false,
      error: 'Invalid fill request.',
      userMessage: 'Analyze fields again before filling.',
      reason: 'invalid-fill-request'
    };
  }

  const capability = await getTabCapability();
  if (!capability.ok || !capability.tabId) {
    return commandFailureFromCapability(capability);
  }
  if (fillRequest && (!capability.url || !isSamePageUrl(fillRequest.pageUrl, capability.url))) {
    return {
      ok: false,
      error: 'The application page changed after analysis.',
      userMessage: 'The application page changed. Analyze fields again before filling.',
      tabUrl: capability.url,
      originPattern: capability.originPattern,
      reason: 'tab-changed'
    };
  }

  const initialTab = { id: capability.tabId, url: capability.url };
  const ready = await ensureContentScriptReady(capability);
  if (!ready.ok) return ready;

  const currentTarget = await getTabSnapshot(capability.tabId);
  if (didTabChange(initialTab, currentTarget)) {
    return {
      ok: false,
      error: 'The page changed before the command started.',
      userMessage: 'The page changed. Open the application page and try again.',
      tabUrl: currentTarget?.url,
      originPattern: capability.originPattern,
      reason: 'tab-changed'
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(capability.tabId, {
      command,
      payload: fillRequest ?? payload
    });
    if (response === undefined) {
      return {
        ok: false,
        error: 'Content script returned no response.',
        userMessage: 'Content script returned no response. Reload the page and try again.',
        tabUrl: capability.url,
        originPattern: capability.originPattern,
        reason: 'content-message-failed'
      };
    }
    if (command === 'OPEN_IN_PAGE_ASSISTANT' && (!isRecord(response) || response.opened !== true)) {
      return {
        ok: false,
        error: 'The in-page assistant did not open.',
        userMessage:
          isRecord(response) && typeof response.userMessage === 'string'
            ? response.userMessage
            : 'The in-page assistant did not open. Reload the page and try again.',
        tabUrl: capability.url,
        originPattern: capability.originPattern,
        reason: 'in-page-assistant-open-failed'
      };
    }

    if (command === 'FILL_APPROVED_FIELDS') {
      const fillResponse = response as FillApprovedFieldsResponse;
      if (
        !fillResponse?.pageMatched ||
        !capability.url ||
        !isSamePageUrl(fillResponse.pageUrl, capability.url)
      ) {
        return {
          ok: false,
          error: 'The application page changed during filling.',
          userMessage:
            fillResponse?.userMessage ??
            'The application page changed. Analyze fields again before filling.',
          tabUrl: fillResponse?.pageUrl ?? capability.url,
          originPattern: capability.originPattern,
          reason: 'tab-changed'
        };
      }
    }

    return {
      ok: true,
      data: response,
      response,
      userMessage:
        command === 'OPEN_IN_PAGE_ASSISTANT'
          ? 'Assistant opened on this page.'
          : 'Command completed.',
      tabUrl: capability.url,
      originPattern: capability.originPattern,
      reason: command === 'OPEN_IN_PAGE_ASSISTANT' ? 'in-page-assistant-opened' : 'completed'
    };
  } catch (error) {
    const currentTarget = await getTabSnapshot(capability.tabId);
    const classified = classifyContentMessageFailure(
      error,
      didTabChange(initialTab, currentTarget)
    );
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

async function openAssistant(): Promise<OpenAssistantResult> {
  const tab = await getActiveTab();
  const targetRemembered = Boolean(tab && (await rememberCurrentAnalyzableTab(tab)));
  if (!tab) {
    return openAssistantTab(targetRemembered, 'no-active-tab');
  }
  if (!tab.id) {
    return openAssistantTab(targetRemembered, 'no-active-tab');
  }
  if (tab.url && isRestrictedUrl(tab.url)) {
    return openAssistantTab(targetRemembered, 'restricted-page');
  }
  if (!chrome.sidePanel?.open) {
    return openAssistantTab(targetRemembered, 'side-panel-api-unavailable');
  }
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    return {
      opened: true,
      openedAs: 'assistant-panel',
      userMessage: 'Assistant panel opened.',
      reason: 'assistant-panel-opened',
      targetRemembered
    };
  } catch {
    return openAssistantTab(targetRemembered, 'side-panel-open-failed');
  }
}

async function openAssistantTab(
  targetRemembered = false,
  fallbackReason = 'assistant-tab-requested'
): Promise<OpenAssistantResult> {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/sidepanel.html') });
    return {
      opened: true,
      openedAs: 'assistant-tab',
      userMessage:
        fallbackReason === 'assistant-tab-requested'
          ? targetRemembered
            ? 'Full assistant opened with this page selected for analysis.'
            : 'Full assistant opened. Open the job or application page, then choose Use This Page.'
          : 'Opened the full assistant because Chrome did not open the side panel.',
      reason:
        fallbackReason === 'assistant-tab-requested'
          ? 'assistant-tab-opened'
          : `assistant-tab-fallback-${fallbackReason}`,
      targetRemembered
    };
  } catch {
    return {
      opened: false,
      openedAs: 'none',
      userMessage:
        'Assistant could not open. Rebuild, reload the extension from dist, and try again.',
      reason: 'assistant-open-failed',
      targetRemembered
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
  if (existingPing?.ok) {
    if (capability.url && isSamePageUrl(existingPing.url, capability.url)) {
      return { ok: true, data: existingPing };
    }
    return {
      ok: false,
      error: 'The page changed before analysis started.',
      userMessage: 'The page changed. Open the page and try again.',
      tabUrl: existingPing.url,
      originPattern: capability.originPattern,
      reason: 'tab-changed'
    };
  }

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

  const currentTarget = await getTabSnapshot(tabId);
  if (didTabChange(initialTab, currentTarget)) {
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
  if (readyPing?.ok) {
    if (capability.url && isSamePageUrl(readyPing.url, capability.url)) {
      return { ok: true, data: readyPing };
    }
    return {
      ok: false,
      error: 'The page changed while the content script was starting.',
      userMessage: 'The page changed. Open the page and try again.',
      tabUrl: readyPing.url,
      originPattern: capability.originPattern,
      reason: 'tab-changed'
    };
  }

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

async function getTabSnapshot(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return undefined;
  }
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
      userMessage: 'Open a job or application page and start the assistant from there.',
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

const applicationSessionStatuses = new Set<ApplicationSession['status']>([
  'draft',
  'manual-verification',
  'filled',
  'submitted-by-user',
  'skipped'
]);

function isApplicationSessionStatus(value: unknown): value is ApplicationSession['status'] {
  return applicationSessionStatuses.has(value as ApplicationSession['status']);
}

function isValidJobPayload(value: unknown): value is JobPosting {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<JobPosting>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.id.length <= 200 &&
    typeof candidate.title === 'string' &&
    candidate.title.length > 0 &&
    candidate.title.length <= 180 &&
    typeof candidate.descriptionText === 'string' &&
    candidate.descriptionText.length <= 12000 &&
    typeof candidate.sourceUrl === 'string' &&
    candidate.sourceUrl.length <= 4000 &&
    isSupportedWebUrl(candidate.sourceUrl) &&
    typeof candidate.sourceSite === 'string' &&
    candidate.sourceSite.length <= 300 &&
    typeof candidate.dateFound === 'string' &&
    candidate.dateFound.length <= 100 &&
    Array.isArray(candidate.detectedKeywords) &&
    candidate.detectedKeywords.length <= 500 &&
    candidate.detectedKeywords.every(
      (keyword) => typeof keyword === 'string' && keyword.length <= 200
    )
  );
}

function deriveApplicationSessionStatus(
  requested: ApplicationSession['status'],
  preview: ApplicationSession['fieldPreview'],
  results: ApplicationSession['fillResults'],
  manualVerificationRequired: boolean
): ApplicationSession['status'] {
  if (requested === 'submitted-by-user' || requested === 'skipped') return requested;
  if (manualVerificationRequired) return 'manual-verification';
  if (requested === 'filled' && isCompleteApprovedFill(preview, results)) return 'filled';
  return 'draft';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
