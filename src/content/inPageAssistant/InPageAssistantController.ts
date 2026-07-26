import { approveSafeHighConfidence } from '../../shared/fill/FillApprovalRules';
import { buildFillPreview } from '../../shared/fill/ProfileValueResolver';
import type { BrowserCompatibility } from '../../shared/extension/BrowserCompatibility';
import {
  browserLabel,
  detectBrowserCompatibility,
  getBraveShieldsGuidance
} from '../../shared/extension/BrowserCompatibility';
import type { ExtensionCommandResult } from '../../shared/extension/ExtensionMessaging';
import type { FillPreviewItem, FillResult } from '../../shared/models/FieldMapping';
import type { JobPosting } from '../../shared/models/JobPosting';
import type { UserProfile } from '../../shared/models/UserProfile';
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
  preview: FillPreviewItem[];
  fillResults: FillResult[];
  status: string;
  warnings: string[];
  minimized: boolean;
  manualVerificationRequired: boolean;
}

let activeState: InPageAssistantState | undefined;
let activeShadow: ShadowRoot | undefined;

export async function openInPageAssistant(): Promise<{
  opened: true;
  restored: boolean;
  openedAs: 'in-page-assistant';
  userMessage: string;
}> {
  const existing = document.getElementById(rootId) as HTMLElement | null;
  if (existing && activeShadow && activeState) {
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

  activeShadow = shadow;
  activeState = {
    browser: await detectBrowserCompatibility(),
    profile: await loadActiveProfile(),
    pageUrl: document.location.href,
    preview: [],
    fillResults: [],
    status: 'Assistant opened on this page.',
    warnings: [],
    minimized: false,
    manualVerificationRequired: false
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

function render(shadow: ShadowRoot, state: InPageAssistantState) {
  shadow.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = inPageAssistantStyles;
  const panel = document.createElement('section');
  panel.className = `panel${state.minimized ? ' minimized' : ''}`;
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
    ?.addEventListener('click', async () => {
      const response = analyzeCurrentJobPage();
      state.manualVerificationRequired = Boolean(response.verification.detected);
      if (!hasMeaningfulJobData(response.job)) {
        state.job = undefined;
        state.status =
          'No clear job details were found on this page. Review the page or try another job page.';
        state.warnings = ['No saved job was created from this weak page analysis.'];
        render(shadow, state);
        return;
      }

      state.job = response.job;
      const saved = await saveAnalyzedJob(response.job);
      state.status = saved.ok
        ? 'Job analyzed and saved. Next: analyze fields or review your profile before filling.'
        : (saved.userMessage ?? 'Job analyzed, but it was not saved locally.');
      state.warnings = saved.ok ? [] : [state.status];
      render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')
    ?.addEventListener('click', async () => {
      const response = analyzeCurrentApplicationFields();
      state.profile = state.profile ?? (await loadActiveProfile());
      state.pageUrl = response.pageUrl;
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
      state.status =
        shields ??
        (response.fieldCount
          ? `${response.fieldCount} fields found. Review suggested values before filling.`
          : 'No fields found. This form may be embedded or not fully loaded.');
      await persistApplicationSession(state);
      render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="approve-safe"]')
    ?.addEventListener('click', async () => {
      state.preview = approveSafeHighConfidence(state.preview);
      state.status = 'Safe high-confidence fields approved. Review values before filling.';
      await persistApplicationSession(state);
      render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="fill"]')
    ?.addEventListener('click', async () => {
      const verification = detectCaptchaAndBotCheck(document);
      state.manualVerificationRequired = Boolean(verification.detected);
      if (verification.detected) {
        state.status = 'Manual verification detected. Complete it yourself before continuing.';
        await persistApplicationSession(state, { status: 'manual-verification' });
        render(shadow, state);
        return;
      }
      state.fillResults = fillApprovedFields(state.preview, document);
      state.preview = updatePreviewStatusesFromResults(state.preview, state.fillResults);
      state.status = 'Approved fields filled. Review the page manually before submitting.';
      await persistApplicationSession(state, { status: 'filled' });
      render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="options"]')
    ?.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ command: 'OPEN_OPTIONS' });
    });

  panel.querySelectorAll<HTMLInputElement>('[data-field-value]').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.index);
      if (!Number.isInteger(index) || !state.preview[index]) return;
      const value = input.value;
      state.preview[index] = {
        ...state.preview[index],
        value,
        rejected: value.trim() ? state.preview[index].rejected : true,
        status:
          state.preview[index].status === 'manual-only'
            ? 'manual-only'
            : value.trim()
              ? 'pending'
              : 'rejected'
      };
    });
    input.addEventListener('change', () => {
      void persistApplicationSession(state);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-action="approve-field"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const index = Number(button.dataset.index);
      const item = state.preview[index];
      if (!Number.isInteger(index) || !item) return;
      if (!canIndividuallyApprove(item)) {
        state.status = item.warning || 'This field needs manual review and was not approved.';
        render(shadow, state);
        return;
      }
      state.preview[index] = { ...item, approved: true, rejected: false, status: 'approved' };
      state.status = 'Field approved. Review all values before filling.';
      await persistApplicationSession(state);
      render(shadow, state);
    });
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-action="skip-field"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const index = Number(button.dataset.index);
      const item = state.preview[index];
      if (!Number.isInteger(index) || !item) return;
      state.preview[index] = { ...item, approved: false, rejected: true, status: 'rejected' };
      state.status = 'Field skipped.';
      await persistApplicationSession(state);
      render(shadow, state);
    });
  });
}

function analyzeCurrentJobPage() {
  return {
    job: extractJobPostingFromDocument(document),
    verification: detectCaptchaAndBotCheck(document)
  };
}

function analyzeCurrentApplicationFields() {
  const verification = detectCaptchaAndBotCheck(document);
  const fields = detectFormFields(document);
  const mappings = mapFieldCandidates(fields);
  const iframeWarnings = detectApplicationIframeWarnings(document);
  return {
    pageUrl: document.location.href,
    fields,
    mappings,
    verification,
    iframeWarnings,
    fieldCount: fields.length
  };
}

function buildMarkup(state: InPageAssistantState): string {
  const browser = state.browser ? browserLabel(state.browser.browserName) : 'Browser';
  const profileReady = Boolean(state.profile);
  const approvals = state.preview.filter((item) => item.approved).length;
  const fields = state.preview.length;
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
          <button data-action="analyze-job">Analyze Job</button>
          <button class="secondary" data-action="analyze-fields">Analyze Fields</button>
          <button class="secondary" data-action="options">Review Profile</button>
        </div>
      </div>
      <div class="flow">
        ${['Job', 'Profile', 'Fields', 'Review', 'Fill', 'Submit manually']
          .map((item) => `<span class="chip">${item}</span>`)
          .join('')}
      </div>
      <div class="card">
        <h3>Status</h3>
        <p>${escapeHtml(state.status)}</p>
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
          ? `<div class="card"><h3>Field Summary</h3><p>${fields} fields in preview. ${approvals} approved.</p>
            <div class="row">
              <button class="secondary" data-action="approve-safe">Approve Safe Fields</button>
              <button data-action="fill" ${approvals ? '' : 'disabled'}>Fill Approved</button>
            </div>
            ${state.preview
              .slice(0, 12)
              .map((item, index) => fieldMarkup(item, index))
              .join('')}
          </div>`
          : ''
      }
      ${
        state.fillResults.length
          ? `<div class="card"><h3>Fill Results</h3>${state.fillResults
              .map(
                (result) => `<p>${escapeHtml(result.selector)}: ${escapeHtml(result.message)}</p>`
              )
              .join('')}</div>`
          : ''
      }
    </div>`;
}

function fieldMarkup(item: FillPreviewItem, index: number): string {
  const label =
    item.candidate.labelText ||
    item.candidate.ariaLabel ||
    item.candidate.placeholder ||
    item.candidate.name ||
    item.kind;
  const approveDisabled = canIndividuallyApprove(item) ? '' : 'disabled';
  return `<div class="field">
    <p><strong>${escapeHtml(label)}</strong> ${item.sensitive ? '<span class="chip warn">Sensitive</span>' : ''}</p>
    <input type="text" value="${escapeAttribute(item.value ?? '')}" data-field-value data-index="${index}" />
    <p>${escapeHtml(item.warning ?? item.explanation ?? '')}</p>
    <div class="row field-actions">
      <button class="secondary" data-action="approve-field" data-index="${index}" ${approveDisabled}>Approve</button>
      <button class="secondary" data-action="skip-field" data-index="${index}">Skip</button>
      <span class="chip">${escapeHtml(item.status ?? 'pending')}</span>
    </div>
  </div>`;
}

function getRecommendedAction(state: InPageAssistantState): string {
  if (!state.job) return 'Start by analyzing this job page.';
  if (!state.profile && !state.preview.length) {
    return 'Profile is needed before filling. You can still analyze fields now.';
  }
  if (!state.preview.length) return 'Analyze application fields.';
  if (!state.preview.some((item) => item.approved)) return 'Review values and approve safe fields.';
  return 'Fill approved fields, then submit manually yourself.';
}

function hasMeaningfulJobData(job: JobPosting): boolean {
  const title = job.title.trim().toLowerCase();
  const hasSpecificTitle = Boolean(
    title && title !== 'untitled job' && title !== 'jobs' && title !== 'careers'
  );
  const hasContext = Boolean(job.company || job.location || job.requirementsText || job.salaryText);
  const hasUsefulDescription = job.descriptionText.trim().length >= 250;
  return hasSpecificTitle || hasContext || hasUsefulDescription || job.detectedKeywords.length >= 2;
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
  return result.data ?? result.response;
}

async function saveAnalyzedJob(job: JobPosting): Promise<ExtensionCommandResult<JobPosting>> {
  return (await chrome.runtime.sendMessage({
    command: 'SAVE_ANALYZED_JOB',
    payload: job
  })) as ExtensionCommandResult<JobPosting>;
}

async function persistApplicationSession(
  state: InPageAssistantState,
  patch: { status?: string } = {}
): Promise<void> {
  if (!state.pageUrl) return;
  await chrome.runtime.sendMessage({
    command: 'SAVE_APPLICATION_SESSION',
    payload: {
      pageUrl: state.pageUrl,
      fieldPreview: state.preview,
      fillResults: state.fillResults,
      manualVerificationRequired: state.manualVerificationRequired,
      status: patch.status ?? (state.fillResults.length ? 'filled' : 'draft'),
      job: state.job,
      jobPostingId: state.job?.id
    }
  });
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
