import {
  approveSafeHighConfidence,
  invalidateApprovals as invalidateFillApprovals,
  isCompleteApprovedFill
} from '../../shared/fill/FillApprovalRules';
import { buildFillPreview } from '../../shared/fill/ProfileValueResolver';
import type { BrowserCompatibility } from '../../shared/extension/BrowserCompatibility';
import {
  browserLabel,
  detectBrowserCompatibility,
  getBraveShieldsGuidance
} from '../../shared/extension/BrowserCompatibility';
import type { ExtensionCommandResult } from '../../shared/extension/ExtensionMessaging';
import type { ApplicationSession } from '../../shared/models/ApplicationSession';
import type { FillPreviewItem, FillResult } from '../../shared/models/FieldMapping';
import type { JobPosting } from '../../shared/models/JobPosting';
import type { UserProfile } from '../../shared/models/UserProfile';
import { isMeaningfulJobPosting } from '../../shared/jobs/JobPostingValidation';
import { isSamePageUrl, maxFillItems } from '../../shared/extension/PageCommandIntegrity';
import { detectCaptchaAndBotCheck } from '../../shared/security/CaptchaAndBotCheckRules';
import { fillApprovedFields } from '../formFiller';
import { detectApplicationIframeWarnings, detectFormFields } from '../formDetector';
import { mapFieldCandidates } from '../fieldMapper';
import { extractJobPostingFromDocument } from '../jobPageExtractor';
import { inPageAssistantStyles } from './InPageAssistantStyles';

const rootId = 'rapid-robot-job-assistant-root';

interface InPageAssistantState {
  browser?: BrowserCompatibility;
  profile?: UserProfile;
  job?: JobPosting;
  pageUrl: string;
  fieldAnalysisPageUrl?: string;
  preview: FillPreviewItem[];
  fillResults: FillResult[];
  status: string;
  warnings: string[];
  minimized: boolean;
  manualVerificationRequired: boolean;
  busy: boolean;
}

let activeState: InPageAssistantState | undefined;
let activeShadow: ShadowRoot | undefined;
let sessionWriteChain: Promise<void> = Promise.resolve();

export async function openInPageAssistant(): Promise<{
  opened: true;
  restored: boolean;
  openedAs: 'in-page-assistant';
  userMessage: string;
}> {
  const existing = document.getElementById(rootId) as HTMLElement | null;
  if (existing && activeShadow && activeState) {
    resetForPageChange(activeState);
    activeState.minimized = false;
    existing.dataset.minimized = 'false';
    render(activeShadow, activeState);
    existing.scrollIntoView?.({ block: 'nearest' });
    return {
      opened: true,
      restored: true,
      openedAs: 'in-page-assistant',
      userMessage: 'Assistant restored on this page.'
    };
  }

  existing?.remove();

  const root = document.createElement('div');
  root.id = rootId;
  root.dataset.minimized = 'false';
  const shadow = root.attachShadow({ mode: 'open' });
  document.documentElement.append(root);

  const pageUrl = document.location.href;
  const [browser, profile, recentSession] = await Promise.all([
    detectBrowserCompatibility(),
    loadActiveProfile(),
    loadRecentSession(pageUrl)
  ]);

  activeShadow = shadow;
  activeState = {
    browser,
    profile,
    job: recentSession?.job,
    pageUrl,
    preview: [],
    fillResults: [],
    status: recentSession
      ? 'A saved session exists for this page. Analyze fields again before filling.'
      : 'Assistant opened on this page.',
    warnings: [],
    minimized: false,
    manualVerificationRequired: recentSession?.manualVerificationRequired ?? false,
    busy: false
  };
  render(shadow, activeState);
  return {
    opened: true,
    restored: false,
    openedAs: 'in-page-assistant',
    userMessage: 'Assistant opened on this page.'
  };
}

export function closeInPageAssistant(): { closed: boolean } {
  document.getElementById(rootId)?.remove();
  activeState = undefined;
  activeShadow = undefined;
  sessionWriteChain = Promise.resolve();
  return { closed: true };
}

export async function toggleInPageAssistant(): Promise<{ opened: boolean; minimized?: boolean }> {
  const root = document.getElementById(rootId);
  if (!root || !activeShadow || !activeState) {
    await openInPageAssistant();
    return { opened: true };
  }
  activeState.minimized = !activeState.minimized;
  root.dataset.minimized = String(activeState.minimized);
  render(activeShadow, activeState);
  return { opened: true, minimized: activeState.minimized };
}

export function getInPageAssistantStatus(): { open: boolean; minimized: boolean } {
  const root = document.getElementById(rootId);
  return {
    open: Boolean(root),
    minimized: activeState?.minimized ?? root?.dataset.minimized === 'true'
  };
}

function render(shadow: ShadowRoot, state: InPageAssistantState): void {
  shadow.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = inPageAssistantStyles;
  const panel = document.createElement('section');
  panel.className = `panel${state.minimized ? ' minimized' : ''}`;
  panel.setAttribute('role', 'complementary');
  panel.setAttribute('aria-label', 'Rapid Robot Job Assistant');
  panel.innerHTML = buildMarkup(state);
  shadow.append(style, panel);
  bindPanelEvents(panel, shadow, state);
}

function bindPanelEvents(
  panel: HTMLElement,
  shadow: ShadowRoot,
  state: InPageAssistantState
): void {
  panel.querySelector<HTMLButtonElement>('[data-action="close"]')?.addEventListener('click', () => {
    closeInPageAssistant();
  });
  panel
    .querySelector<HTMLButtonElement>('[data-action="minimize"]')
    ?.addEventListener('click', () => {
      state.minimized = !state.minimized;
      document.getElementById(rootId)?.setAttribute('data-minimized', String(state.minimized));
      render(shadow, state);
    });

  panel
    .querySelector<HTMLButtonElement>('[data-action="analyze-job"]')
    ?.addEventListener('click', () => {
      void runBusy(shadow, state, async () => {
        resetForPageChange(state);
        const response = analyzeCurrentJobPage();
        state.manualVerificationRequired = Boolean(response.verification.detected);
        if (!isMeaningfulJobPosting(response.job)) {
          state.job = undefined;
          state.status =
            'No clear job details were found on this page. Review the page or try another job page.';
          state.warnings = ['No saved job was created from this weak page analysis.'];
          return;
        }

        state.job = response.job;
        const saved = await saveAnalyzedJob(response.job);
        state.status = saved.ok
          ? response.verification.detected
            ? 'Job saved. Manual verification is present on this page and must be handled by you.'
            : 'Job analyzed and saved. Next: analyze fields or review your profile before filling.'
          : (saved.userMessage ?? 'Job analyzed, but it was not saved locally.');
        state.warnings = saved.ok ? [] : [state.status];
      });
    });

  panel
    .querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')
    ?.addEventListener('click', () => {
      void runBusy(shadow, state, async () => {
        resetForPageChange(state);
        const response = analyzeCurrentApplicationFields();
        state.profile = state.profile ?? (await loadActiveProfile());
        state.pageUrl = response.pageUrl;
        state.fieldAnalysisPageUrl = response.pageUrl;
        state.preview = buildFillPreview(response.mappings, state.profile);
        state.fillResults = [];
        state.manualVerificationRequired = Boolean(response.verification.detected);

        const shields = getBraveShieldsGuidance({
          browserName: state.browser?.browserName ?? 'unknown',
          fieldCount: response.fieldCount,
          iframeWarnings: response.iframeWarnings,
          formDetectionFailed: response.fieldCount === 0
        });
        state.warnings = [...response.iframeWarnings, ...(shields ? [shields] : [])].filter(
          uniqueOnly
        );

        if (response.fieldCount === 0) {
          state.fieldAnalysisPageUrl = undefined;
          state.preview = [];
          state.status =
            shields ?? 'No fields found. This form may be embedded, hidden, or not fully loaded.';
          return;
        }

        state.status = response.verification.detected
          ? 'Manual verification detected. Complete it yourself before filling.'
          : `${response.fieldCount} fields found. Review every suggested value before filling.`;
        const saved = await persistApplicationSession(state, {
          status: response.verification.detected ? 'manual-verification' : 'draft'
        });
        if (!saved) {
          state.status = 'Fields were analyzed, but the application session was not saved locally.';
        }
      });
    });

  panel
    .querySelector<HTMLButtonElement>('[data-action="approve-safe"]')
    ?.addEventListener('click', () => {
      void runBusy(shadow, state, async () => {
        state.preview = approveSafeHighConfidence(state.preview);
        const saved = await persistApplicationSession(state);
        state.status = saved
          ? 'Safe high-confidence fields approved. Review every value before filling.'
          : 'Fields were approved in this panel, but the session was not saved locally.';
      });
    });

  panel.querySelector<HTMLButtonElement>('[data-action="fill"]')?.addEventListener('click', () => {
    void runBusy(shadow, state, async () => {
      const currentUrl = document.location.href;
      if (!state.fieldAnalysisPageUrl || !isSamePageUrl(currentUrl, state.fieldAnalysisPageUrl)) {
        invalidateApprovals(state);
        state.status =
          'The page changed after field analysis. Analyze fields again before filling anything.';
        state.warnings = ['Approvals were cleared because the analyzed page is no longer current.'];
        return;
      }

      const approvedItems = state.preview.filter((item) => item.approved);
      if (!approvedItems.length) {
        state.status = 'Approve at least one reviewed safe field before filling.';
        return;
      }

      const verification = detectCaptchaAndBotCheck(document);
      state.manualVerificationRequired = Boolean(verification.detected);
      if (verification.detected) {
        state.status = 'Manual verification detected. Complete it yourself before continuing.';
        await persistApplicationSession(state, { status: 'manual-verification' });
        return;
      }

      state.fillResults = fillApprovedFields(state.preview, document);
      state.preview = updatePreviewStatusesFromResults(state.preview, state.fillResults);
      const succeeded = state.fillResults.filter((result) => result.ok).length;
      const failed = state.fillResults.length - succeeded;
      const complete = isCompleteApprovedFill(state.preview, state.fillResults);

      state.status = complete
        ? `All ${succeeded} approved fields were filled. Review the page manually before submitting.`
        : `${succeeded} approved fields filled and ${failed} failed. Review failures and analyze fields again before retrying.`;
      const saved = await persistApplicationSession(state, {
        status: complete ? 'filled' : 'draft'
      });
      if (!saved) {
        state.status += ' The fill result was not saved locally.';
      }
    });
  });

  panel
    .querySelector<HTMLButtonElement>('[data-action="options"]')
    ?.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ command: 'OPEN_OPTIONS' });
    });

  panel
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field-value]')
    .forEach((input) => {
      input.addEventListener('input', () => {
        if (!isSamePageUrl(state.pageUrl, document.location.href)) {
          resetForPageChange(state);
          state.warnings = ['Approvals were cleared because the application page changed.'];
          render(shadow, state);
          return;
        }
        const index = Number(input.dataset.index);
        if (!Number.isInteger(index) || !state.preview[index]) return;
        const value = input.value;
        const current = state.preview[index];
        state.preview[index] = {
          ...current,
          value,
          approved: false,
          rejected: !value.trim(),
          status:
            current.status === 'manual-only' ? 'manual-only' : value.trim() ? 'pending' : 'rejected'
        };
        const fillButton = panel.querySelector<HTMLButtonElement>('[data-action="fill"]');
        if (fillButton) fillButton.disabled = !state.preview.some((item) => item.approved);
      });
      input.addEventListener('change', () => {
        if (!isSamePageUrl(state.pageUrl, document.location.href)) {
          resetForPageChange(state);
          state.warnings = [
            'The changed page was not saved under the previous application session.'
          ];
          render(shadow, state);
          return;
        }
        void persistApplicationSession(state).then((saved) => {
          if (!saved && activeShadow === shadow && activeState === state) {
            render(shadow, state);
          }
        });
      });
    });

  panel.querySelectorAll<HTMLButtonElement>('[data-action="approve-field"]').forEach((button) => {
    button.addEventListener('click', () => {
      void runBusy(shadow, state, async () => {
        const index = Number(button.dataset.index);
        const item = state.preview[index];
        if (!Number.isInteger(index) || !item) return;
        if (!canIndividuallyApprove(item)) {
          state.status = item.warning || 'This field needs manual review and was not approved.';
          return;
        }
        state.preview[index] = {
          ...item,
          approved: true,
          rejected: false,
          status: 'approved'
        };
        const saved = await persistApplicationSession(state);
        state.status = saved
          ? 'Field approved. Review all values before filling.'
          : 'Field approved in this panel, but the session was not saved locally.';
      });
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-action="skip-field"]').forEach((button) => {
    button.addEventListener('click', () => {
      void runBusy(shadow, state, async () => {
        const index = Number(button.dataset.index);
        const item = state.preview[index];
        if (!Number.isInteger(index) || !item) return;
        state.preview[index] = {
          ...item,
          approved: false,
          rejected: true,
          status: 'rejected'
        };
        const saved = await persistApplicationSession(state);
        state.status = saved
          ? 'Field skipped.'
          : 'Field skipped in this panel, but the session was not saved locally.';
      });
    });
  });
}

async function runBusy(
  shadow: ShadowRoot,
  state: InPageAssistantState,
  action: () => Promise<void>
): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  render(shadow, state);
  try {
    await action();
  } catch {
    state.status = 'The action could not finish. Reload the page and try again.';
    state.warnings = ['No automatic retry was performed.'];
  } finally {
    state.busy = false;
    render(shadow, state);
  }
}

function resetForPageChange(state: InPageAssistantState): void {
  const currentUrl = document.location.href;
  if (isSamePageUrl(state.pageUrl, currentUrl)) return;
  state.pageUrl = currentUrl;
  state.fieldAnalysisPageUrl = undefined;
  state.job = undefined;
  state.preview = [];
  state.fillResults = [];
  state.manualVerificationRequired = false;
  state.warnings = [];
  state.status = 'The page changed. Analyze this page before continuing.';
}

function invalidateApprovals(state: InPageAssistantState): void {
  state.preview = invalidateFillApprovals(state.preview);
}

function analyzeCurrentJobPage() {
  return {
    job: extractJobPostingFromDocument(document),
    verification: detectCaptchaAndBotCheck(document)
  };
}

function analyzeCurrentApplicationFields() {
  const verification = detectCaptchaAndBotCheck(document);
  const detectedFields = detectFormFields(document);
  const fields = detectedFields.slice(0, maxFillItems);
  const mappings = mapFieldCandidates(fields);
  const iframeWarnings = detectApplicationIframeWarnings(document);
  return {
    pageUrl: document.location.href,
    fields,
    mappings,
    verification,
    iframeWarnings: [
      ...iframeWarnings,
      ...(detectedFields.length > maxFillItems
        ? [
            `Only the first ${maxFillItems} detected fields are included. Review the remaining fields manually.`
          ]
        : [])
    ],
    fieldCount: fields.length
  };
}

function buildMarkup(state: InPageAssistantState): string {
  const browser = state.browser ? browserLabel(state.browser.browserName) : 'Browser';
  const profileReady = Boolean(state.profile);
  const approvals = state.preview.filter((item) => item.approved).length;
  const fields = state.preview.length;
  const disabled = state.busy ? 'disabled' : '';
  return `
    <div class="header">
      <div>
        <h2>Rapid Robot Job Assistant</h2>
        <div class="row">
          <span class="chip ok">Local-first</span>
          <span class="chip">Browser: ${escapeHtml(browser)}</span>
          <span class="chip ${profileReady ? 'ok' : 'warn'}">${profileReady ? 'Profile ready' : 'Profile needed before fill'}</span>
        </div>
      </div>
      <div class="row">
        <button class="secondary" data-action="minimize" aria-label="Minimize assistant">${state.minimized ? 'Restore' : 'Minimize'}</button>
        <button class="secondary" data-action="close" aria-label="Close assistant">Close</button>
      </div>
    </div>
    <div class="body">
      <div class="card">
        <h3>Recommended next action</h3>
        <p>${escapeHtml(getRecommendedAction(state))}</p>
        <div class="row">
          <button data-action="analyze-job" ${disabled}>Analyze Job</button>
          <button class="secondary" data-action="analyze-fields" ${disabled}>Analyze Fields</button>
          <button class="secondary" data-action="options" ${disabled}>Review Profile</button>
        </div>
      </div>
      <div class="flow">
        ${['Job', 'Profile', 'Fields', 'Review', 'Fill', 'Submit manually']
          .map((item) => `<span class="chip">${item}</span>`)
          .join('')}
      </div>
      <div class="card">
        <h3>Status</h3>
        <p>${escapeHtml(state.busy ? 'Working on the selected action.' : state.status)}</p>
        ${state.warnings.map((warning) => `<p class="warn">${escapeHtml(warning)}</p>`).join('')}
        <p>No auto-submit. You submit manually.</p>
      </div>
      ${
        state.job
          ? `<div class="card"><h3>Job Summary</h3><p>${escapeHtml(
              [state.job.title, state.job.company, state.job.location].filter(Boolean).join(' | ')
            )}</p></div>`
          : ''
      }
      ${
        fields
          ? `<div class="card"><h3>Field Summary</h3><p>All ${fields} detected fields are shown. ${approvals} approved.</p>
            <div class="row">
              <button class="secondary" data-action="approve-safe" ${disabled}>Approve Safe Fields</button>
              <button data-action="fill" ${state.busy || !approvals ? 'disabled' : ''}>Fill Approved</button>
            </div>
            ${state.preview.map((item, index) => fieldMarkup(item, index, state.busy)).join('')}
          </div>`
          : ''
      }
      ${
        state.fillResults.length
          ? `<div class="card"><h3>Fill Results</h3>${state.fillResults
              .map(
                (result) =>
                  `<p class="${result.ok ? 'ok' : 'warn'}">${escapeHtml(result.selector)}: ${escapeHtml(result.message)}</p>`
              )
              .join('')}</div>`
          : ''
      }
    </div>`;
}

function fieldMarkup(item: FillPreviewItem, index: number, busy: boolean): string {
  const label =
    item.candidate.labelText ||
    item.candidate.ariaLabel ||
    item.candidate.placeholder ||
    item.candidate.name ||
    item.kind;
  const approveDisabled = busy || !canIndividuallyApprove(item) ? 'disabled' : '';
  const multiline = item.kind === 'education' || item.kind === 'workExperience';
  const valueEditor = multiline
    ? `<textarea data-field-value data-index="${index}">${escapeHtml(item.value ?? '')}</textarea>`
    : `<input type="text" value="${escapeAttribute(item.value ?? '')}" data-field-value data-index="${index}" />`;
  return `<div class="field">
    <p><strong>${escapeHtml(label)}</strong> ${item.sensitive ? '<span class="chip warn">Sensitive</span>' : ''}</p>
    ${valueEditor}
    <p>${escapeHtml(item.warning ?? item.explanation ?? '')}</p>
    <div class="row field-actions">
      <button class="secondary" data-action="approve-field" data-index="${index}" ${approveDisabled}>Approve</button>
      <button class="secondary" data-action="skip-field" data-index="${index}" ${busy ? 'disabled' : ''}>Skip</button>
      <span class="chip">${escapeHtml(item.status ?? 'pending')}</span>
    </div>
  </div>`;
}

function getRecommendedAction(state: InPageAssistantState): string {
  if (state.manualVerificationRequired) {
    return 'Complete manual verification yourself before filling.';
  }
  if (!state.job && !state.preview.length)
    return 'Analyze the job or application fields on this page.';
  if (!state.profile && !state.preview.length) {
    return 'Profile is needed before filling. You can still analyze fields now.';
  }
  if (!state.preview.length) return 'Analyze application fields.';
  if (!state.preview.some((item) => item.approved)) return 'Review values and approve safe fields.';
  return 'Fill approved fields, then submit manually yourself.';
}

function canIndividuallyApprove(item: FillPreviewItem): boolean {
  return Boolean(
    item.value?.trim() &&
    item.fillable &&
    !item.sensitive &&
    item.status !== 'manual-only' &&
    item.candidate.visible &&
    !item.candidate.disabled &&
    !item.candidate.readOnly &&
    item.candidate.stableSelector !== false
  );
}

function updatePreviewStatusesFromResults(
  preview: FillPreviewItem[],
  results: FillResult[]
): FillPreviewItem[] {
  return preview.map((item) => {
    const fillResult = results.find((candidate) => candidate.selector === item.candidate.selector);
    return fillResult
      ? { ...item, status: fillResult.ok ? ('filled' as const) : ('failed' as const) }
      : item;
  });
}

async function loadActiveProfile(): Promise<UserProfile | undefined> {
  const result = (await chrome.runtime.sendMessage({
    command: 'GET_ACTIVE_PROFILE'
  })) as ExtensionCommandResult<UserProfile | undefined>;
  return result.ok ? (result.data ?? result.response) : undefined;
}

async function loadRecentSession(pageUrl: string): Promise<ApplicationSession | undefined> {
  try {
    const result = (await chrome.runtime.sendMessage({
      command: 'GET_RECENT_SESSION_FOR_PAGE',
      payload: { pageUrl }
    })) as ExtensionCommandResult<ApplicationSession | undefined>;
    return result.ok ? (result.data ?? result.response) : undefined;
  } catch {
    return undefined;
  }
}

async function saveAnalyzedJob(job: JobPosting): Promise<ExtensionCommandResult<JobPosting>> {
  return (await chrome.runtime.sendMessage({
    command: 'SAVE_ANALYZED_JOB',
    payload: job
  })) as ExtensionCommandResult<JobPosting>;
}

async function persistApplicationSession(
  state: InPageAssistantState,
  patch: { status?: ApplicationSession['status'] } = {}
): Promise<boolean> {
  if (!state.pageUrl || !state.preview.length) return false;
  try {
    const write = sessionWriteChain
      .catch(() => undefined)
      .then(
        () =>
          chrome.runtime.sendMessage({
            command: 'SAVE_APPLICATION_SESSION',
            payload: {
              pageUrl: state.pageUrl,
              fieldPreview: state.preview,
              fillResults: state.fillResults,
              manualVerificationRequired: state.manualVerificationRequired,
              status: patch.status ?? 'draft',
              job: state.job,
              jobPostingId: state.job?.id
            }
          }) as Promise<ExtensionCommandResult<ApplicationSession>>
      );
    sessionWriteChain = write.then(() => undefined);
    const result = await write;

    if (!result.ok) {
      state.warnings = [
        ...state.warnings,
        result.userMessage ?? 'The application session was not saved locally.'
      ].filter(uniqueOnly);
      return false;
    }
    return true;
  } catch {
    state.warnings = [...state.warnings, 'The application session was not saved locally.'].filter(
      uniqueOnly
    );
    return false;
  }
}

function uniqueOnly(value: string, index: number, values: string[]): boolean {
  return Boolean(value) && values.indexOf(value) === index;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[char] ?? char;
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
