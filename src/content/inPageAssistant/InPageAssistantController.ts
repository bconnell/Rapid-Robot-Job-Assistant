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
  preview: FillPreviewItem[];
  fillResults: FillResult[];
  status: string;
  minimized: boolean;
}

export async function openInPageAssistant(): Promise<{ opened: true; restored: boolean }> {
  const existing = document.getElementById(rootId) as HTMLElement | null;
  if (existing) {
    existing.dataset.minimized = 'false';
    existing.scrollIntoView?.({ block: 'nearest' });
    return { opened: true, restored: true };
  }

  const root = document.createElement('div');
  root.id = rootId;
  const shadow = root.attachShadow({ mode: 'open' });
  document.documentElement.append(root);
  const state: InPageAssistantState = {
    browser: await detectBrowserCompatibility(),
    profile: await loadActiveProfile(),
    preview: [],
    fillResults: [],
    status: 'Assistant opened on this page.',
    minimized: false
  };
  render(shadow, state);
  return { opened: true, restored: false };
}

export function closeInPageAssistant(): { closed: boolean } {
  document.getElementById(rootId)?.remove();
  return { closed: true };
}

export async function toggleInPageAssistant(): Promise<{ opened: boolean; minimized?: boolean }> {
  const root = document.getElementById(rootId);
  if (!root) {
    await openInPageAssistant();
    return { opened: true };
  }
  root.dataset.minimized = root.dataset.minimized === 'true' ? 'false' : 'true';
  return { opened: true, minimized: root.dataset.minimized === 'true' };
}

export function getInPageAssistantStatus(): { open: boolean; minimized: boolean } {
  const root = document.getElementById(rootId);
  return { open: Boolean(root), minimized: root?.dataset.minimized === 'true' };
}

async function render(shadow: ShadowRoot, state: InPageAssistantState) {
  shadow.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = inPageAssistantStyles;
  const panel = document.createElement('section');
  panel.className = `panel${state.minimized ? ' minimized' : ''}`;
  panel.innerHTML = buildMarkup(state);
  shadow.append(style, panel);

  panel.querySelector<HTMLButtonElement>('[data-action="close"]')?.addEventListener('click', () => {
    closeInPageAssistant();
  });
  panel
    .querySelector<HTMLButtonElement>('[data-action="minimize"]')
    ?.addEventListener('click', () => {
      state.minimized = !state.minimized;
      void render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="analyze-job"]')
    ?.addEventListener('click', async () => {
      const response = analyzeCurrentJobPage();
      state.job = response.job;
      state.status = response.job?.title
        ? 'Job analyzed. Next: analyze fields or review your profile before filling.'
        : 'No clear job details were found on this page.';
      await chrome.runtime.sendMessage({ command: 'SAVE_ANALYZED_JOB', payload: response.job });
      await render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')
    ?.addEventListener('click', async () => {
      const response = analyzeCurrentApplicationFields();
      state.profile = state.profile ?? (await loadActiveProfile());
      state.preview = buildFillPreview(response.mappings, state.profile);
      const shields = getBraveShieldsGuidance({
        browserName: state.browser?.browserName ?? 'unknown',
        fieldCount: response.fieldCount,
        iframeWarnings: response.iframeWarnings,
        formDetectionFailed: response.fieldCount === 0
      });
      state.status =
        shields ??
        (response.fieldCount
          ? `${response.fieldCount} fields found. Review suggested values before filling.`
          : 'No fields found. This form may be embedded or not fully loaded.');
      await chrome.runtime.sendMessage({
        command: 'SAVE_APPLICATION_SESSION',
        payload: {
          pageUrl: response.pageUrl,
          fieldPreview: state.preview,
          manualVerificationRequired: Boolean(response.verification.detected)
        }
      });
      await render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="approve-safe"]')
    ?.addEventListener('click', async () => {
      state.preview = approveSafeHighConfidence(state.preview);
      state.status = 'Safe high-confidence fields approved. Review values before filling.';
      await render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="fill"]')
    ?.addEventListener('click', async () => {
      const verification = detectCaptchaAndBotCheck(document);
      if (verification.detected) {
        state.status = 'Manual verification detected. Complete it yourself before continuing.';
        await render(shadow, state);
        return;
      }
      state.fillResults = fillApprovedFields(state.preview, document);
      state.status = 'Approved fields filled. Review the page manually before submitting.';
      await render(shadow, state);
    });
  panel
    .querySelector<HTMLButtonElement>('[data-action="options"]')
    ?.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ command: 'OPEN_OPTIONS' });
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
            ${state.preview.slice(0, 6).map(fieldMarkup).join('')}
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

function fieldMarkup(item: FillPreviewItem): string {
  const label =
    item.candidate.labelText ||
    item.candidate.ariaLabel ||
    item.candidate.placeholder ||
    item.candidate.name ||
    item.kind;
  return `<div class="field">
    <p><strong>${escapeHtml(label)}</strong> ${item.sensitive ? '<span class="chip warn">Sensitive</span>' : ''}</p>
    <input type="text" value="${escapeAttribute(item.value ?? '')}" disabled />
    <p>${escapeHtml(item.warning ?? item.explanation ?? '')}</p>
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

async function loadActiveProfile(): Promise<UserProfile | undefined> {
  const result = (await chrome.runtime.sendMessage({
    command: 'GET_ACTIVE_PROFILE'
  })) as ExtensionCommandResult<UserProfile | undefined>;
  return result.data ?? result.response;
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
