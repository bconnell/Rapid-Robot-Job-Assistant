import { useEffect, useRef, useState } from 'react';
import type { ApplicationSession } from '../shared/models/ApplicationSession';
import type { FillPreviewItem, FillResult } from '../shared/models/FieldMapping';
import type { JobPosting } from '../shared/models/JobPosting';
import type { UserProfile } from '../shared/models/UserProfile';
import type {
  ExtensionCommandResult,
  PermissionRequestResult
} from '../shared/extension/ExtensionMessaging';
import type { FillApprovedFieldsResponse } from '../content/contentMessenger';
import { requestCurrentSitePermissionFromUi } from '../shared/extension/PermissionRequestClient';
import type { TabCapabilityResult } from '../shared/extension/TabPermissions';
import { canOfferSitePermission, canRunPageCommand } from '../shared/extension/TabPermissions';
import {
  browserLabel,
  detectBrowserCompatibility,
  getBraveShieldsGuidance,
  type BrowserCompatibility
} from '../shared/extension/BrowserCompatibility';
import {
  approveSafeHighConfidence,
  clearApprovals,
  invalidateApprovals,
  isCompleteApprovedFill
} from '../shared/fill/FillApprovalRules';
import { buildFillPreview } from '../shared/fill/ProfileValueResolver';
import { isMeaningfulJobPosting } from '../shared/jobs/JobPostingValidation';
import { isSamePageUrl, normalizePageUrl } from '../shared/extension/PageCommandIntegrity';
import {
  isValidApplicationSessionRecord,
  isValidJobPostingRecord,
  isValidUserProfileRecord
} from '../shared/data/LocalDataTransfer';
import {
  buildWorkflowState,
  compactWorkflowSteps,
  postActionMessage,
  profileActionLabel,
  profileHelperText,
  profileStatusLabel,
  statusTone,
  type WorkflowStep
} from '../shared/workflow/WorkflowState';
import { ChromeStorageRepository } from '../shared/storage/ChromeStorageRepository';
import {
  ApplicationSessionRepository,
  JobPostingRepository,
  ProfileRepository
} from '../shared/storage/TypedRepositories';

const settingsRepo = new ChromeStorageRepository();
const profileRepo = new ProfileRepository();
const jobRepo = new JobPostingRepository();
const sessionRepo = new ApplicationSessionRepository();

interface FieldAnalysisSummary {
  fieldCount: number;
  fillableCount: number;
  manualOnlyCount: number;
  sensitiveCount: number;
  unknownCount: number;
}

export function SidePanelApp() {
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [job, setJob] = useState<JobPosting | undefined>();
  const [session, setSession] = useState<ApplicationSession | undefined>();
  const [preview, setPreview] = useState<FillPreviewItem[]>([]);
  const [fillResults, setFillResults] = useState<FillResult[]>([]);
  const [verification, setVerification] = useState('No manual verification detected.');
  const [status, setStatus] = useState('Open a job or application page, then analyze when ready.');
  const [notes, setNotes] = useState('');
  const [pageStatus, setPageStatus] = useState<TabCapabilityResult>();
  const [fieldSummary, setFieldSummary] = useState<FieldAnalysisSummary>();
  const [pageWarnings, setPageWarnings] = useState<string[]>([]);
  const [browser, setBrowser] = useState<BrowserCompatibility>();
  const sessionWriteChain = useRef<Promise<void>>(Promise.resolve());
  const loadSequence = useRef(0);
  const previewRef = useRef<FillPreviewItem[]>([]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    void loadActiveProfile();
    void loadTabStatus();
    void detectBrowserCompatibility().then(setBrowser);
    // Mount-only initialization; later target refreshes are invoked explicitly after page actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTabStatus() {
    const requestId = ++loadSequence.current;
    const result = (await chrome.runtime.sendMessage({
      command: 'GET_CURRENT_TAB_STATUS'
    })) as ExtensionCommandResult<TabCapabilityResult>;
    if (requestId !== loadSequence.current) return;
    const nextStatus = result.data ?? result.response;
    setPageStatus(nextStatus);

    if (!result.ok || !nextStatus?.ok || !nextStatus.url) {
      clearSessionBoundState();
      setStatus(
        nextStatus?.userMessage ??
          result.userMessage ??
          'Open a normal job or application page before continuing.'
      );
      return;
    }

    const storedExisting = await sessionRepo.findByPageUrl(nextStatus.url);
    if (requestId !== loadSequence.current) return;
    if (storedExisting && !isValidApplicationSessionRecord(storedExisting)) {
      clearSessionBoundState(true);
      setStatus('The saved application session was invalid and was not loaded.');
      return;
    }
    const existing = storedExisting;
    if (!existing) {
      if (session && !isSamePageUrl(session.pageUrl, nextStatus.url)) {
        clearSessionBoundState(true);
      }
      return;
    }

    const restoredPreview = invalidateApprovals(existing.fieldPreview);
    setSession(existing);
    setJob(existing.job);
    previewRef.current = restoredPreview;
    setPreview(restoredPreview);
    setFillResults([]);
    setNotes(existing.notes);
    setFieldSummary(undefined);
    setVerification(
      existing.manualVerificationRequired
        ? 'Manual verification required.'
        : 'No manual verification detected.'
    );
    setStatus(
      'Saved session history loaded for review. Analyze fields again before editing, approving, or filling.'
    );
  }

  async function loadActiveProfile() {
    const id = await settingsRepo.getActiveProfileId();
    const storedActive = id ? await profileRepo.get(id) : undefined;
    const active =
      storedActive && isValidUserProfileRecord(storedActive) ? storedActive : undefined;
    if (id && !active) {
      await settingsRepo.clearActiveProfileId();
    }
    setProfile(active);
    if (storedActive && !active) {
      setStatus('The saved active profile was invalid and was not loaded.');
    }
  }

  async function analyzeJob() {
    const result = (await chrome.runtime.sendMessage({
      command: 'ANALYZE_CURRENT_JOB_PAGE'
    })) as ExtensionCommandResult<{ job?: JobPosting; verification?: { detected?: boolean } }>;
    if (!result.ok) {
      await handleCommandFailure(result);
      return;
    }
    const response = result.data ?? result.response;
    const analyzed = response?.job;
    if (!analyzed || !isValidJobPostingRecord(analyzed) || !isMeaningfulJobPosting(analyzed)) {
      setJob(undefined);
      setStatus('No reliable job data was found. Nothing was saved.');
      return;
    }
    const saved = await jobRepo.saveOrUpdate({ ...analyzed, status: 'saved' });
    setJob(saved.job);
    setVerification(
      response?.verification?.detected
        ? 'Manual verification required.'
        : 'No manual verification detected.'
    );
    setStatus(postActionMessage('job-analyzed', Boolean(profile)));
  }

  async function analyzeFields() {
    const result = (await chrome.runtime.sendMessage({
      command: 'ANALYZE_APPLICATION_FIELDS'
    })) as ExtensionCommandResult<{
      pageUrl?: string;
      mappings?: Parameters<typeof buildFillPreview>[0];
      verification?: { detected?: boolean };
      warnings?: string[];
      iframeWarnings?: string[];
      fieldCount?: number;
      fillableCount?: number;
      manualOnlyCount?: number;
      sensitiveCount?: number;
      unknownCount?: number;
    }>;
    if (!result.ok) {
      await handleCommandFailure(result);
      return;
    }
    const response = result.data ?? result.response;
    if (!response?.pageUrl || !result.tabUrl || !isSamePageUrl(response.pageUrl, result.tabUrl)) {
      clearSessionBoundState();
      setStatus(
        'The application page changed during field analysis. Analyze the current page again.'
      );
      return;
    }
    const detectedCount = response.mappings?.length ?? 0;
    if (detectedCount === 0) {
      clearSessionBoundState();
      const shieldsGuidance = getBraveShieldsGuidance({
        browserName: browser?.browserName ?? 'unknown',
        fieldCount: 0,
        iframeWarnings: response.iframeWarnings,
        formDetectionFailed: true
      });
      setPageWarnings(
        [
          ...(response.warnings ?? []),
          ...(response.iframeWarnings ?? []),
          ...(shieldsGuidance ? [shieldsGuidance] : [])
        ].filter((warning, index, all) => all.indexOf(warning) === index)
      );
      setStatus(shieldsGuidance ?? 'No fields were found. No empty session was created.');
      return;
    }
    const nextPreview = buildFillPreview(response?.mappings ?? [], profile);
    const nextWarnings = [...(response.warnings ?? []), ...(response.iframeWarnings ?? [])].filter(
      (warning, index, all) => all.indexOf(warning) === index
    );
    const shieldsGuidance = getBraveShieldsGuidance({
      browserName: browser?.browserName ?? 'unknown',
      fieldCount: response.fieldCount ?? nextPreview.length,
      iframeWarnings: response.iframeWarnings,
      formDetectionFailed: (response.fieldCount ?? nextPreview.length) === 0
    });
    if (shieldsGuidance && !nextWarnings.includes(shieldsGuidance)) {
      nextWarnings.push(shieldsGuidance);
    }
    const nextSummary = {
      fieldCount: nextPreview.length,
      fillableCount: nextPreview.filter((item) => item.fillable).length,
      manualOnlyCount: nextPreview.filter((item) => item.status === 'manual-only').length,
      sensitiveCount: nextPreview.filter((item) => item.sensitive).length,
      unknownCount: nextPreview.filter((item) => item.kind === 'unknown').length
    };
    const pageUrl = normalizePageUrl(response.pageUrl);
    if (!pageUrl) {
      setStatus('The application page URL was invalid. No session was created.');
      return;
    }
    const existing = await sessionRepo.findByPageUrl(pageUrl);
    if (existing && !isValidApplicationSessionRecord(existing)) {
      setStatus('The saved application session was invalid and was not overwritten.');
      return;
    }
    const now = new Date().toISOString();
    const nextSession: ApplicationSession = {
      id: existing?.id ?? crypto.randomUUID(),
      job,
      jobPostingId: job?.id,
      pageUrl,
      startedAt: existing?.startedAt ?? now,
      fieldPreview: nextPreview,
      fillResults: [],
      manualVerificationRequired: Boolean(response?.verification?.detected),
      notes: existing?.notes ?? notes,
      status: response?.verification?.detected ? 'manual-verification' : 'draft',
      submittedByUser: false,
      updatedAt: now
    };
    if (!(await queueSessionWrite(nextSession))) {
      setStatus('The analyzed fields could not be saved locally.');
      return;
    }
    setSession(nextSession);
    previewRef.current = nextPreview;
    setPreview(nextPreview);
    setFieldSummary(nextSummary);
    setPageWarnings(nextWarnings);
    setNotes(nextSession.notes);
    setFillResults([]);
    setVerification(
      nextSession.manualVerificationRequired
        ? 'Manual verification required.'
        : 'No manual verification detected.'
    );
    setStatus(
      `${nextSummary.fieldCount} fields found. ${nextSummary.fillableCount} safe fill candidates. ${postActionMessage('fields-analyzed')}`
    );
  }

  async function fillApproved() {
    if (!fieldSummary || fillResults.length > 0 || session?.status === 'filled') {
      setStatus('Analyze the current application fields before another fill attempt.');
      return;
    }
    const pageUrl = session?.pageUrl;
    if (!pageUrl || !pageStatus?.url || !isSamePageUrl(pageUrl, pageStatus.url)) {
      clearSessionBoundState();
      setStatus('The application page changed. Analyze fields again before filling.');
      return;
    }
    const requestPreview = previewRef.current;
    if (!requestPreview.some((item) => item.approved)) {
      setStatus('Approve at least one safe field before filling.');
      return;
    }

    const result = (await chrome.runtime.sendMessage({
      command: 'FILL_APPROVED_FIELDS',
      payload: { pageUrl, preview: requestPreview }
    })) as ExtensionCommandResult<FillApprovedFieldsResponse>;
    if (!result.ok) {
      await handleCommandFailure(result);
      return;
    }

    const response = result.data ?? result.response;
    if (!response?.pageMatched || !isSamePageUrl(pageUrl, response.pageUrl)) {
      clearSessionBoundState();
      setStatus(
        response?.userMessage ??
          'The application page changed. Analyze fields again before filling.'
      );
      return;
    }
    if (response.verification.detected) {
      setVerification('Manual verification required. Filling paused.');
      setStatus('CAPTCHA or bot check detected. Finish it manually, then analyze fields again.');
      await saveSession({ manualVerificationRequired: true, status: 'manual-verification' });
      return;
    }

    const results = response.results;
    const nextPreview = requestPreview.map((item) => {
      const fillResult = results.find(
        (candidate) => candidate.selector === item.candidate.selector
      );
      return fillResult
        ? { ...item, status: fillResult.ok ? ('filled' as const) : ('failed' as const) }
        : item;
    });
    const complete = isCompleteApprovedFill(nextPreview, results);
    previewRef.current = nextPreview;
    setPreview(nextPreview);
    setFillResults(results);
    const saved = await saveSession({
      fieldPreview: nextPreview,
      fillResults: results,
      status: complete ? 'filled' : 'draft'
    });
    if (!saved) return;
    if (!complete) {
      setFieldSummary(undefined);
    }
    const successfulCount = results.filter((fillResult) => fillResult.ok).length;
    setStatus(
      complete
        ? postActionMessage('filled')
        : `${successfulCount} approved fields filled and ${results.length - successfulCount} failed. Review failures and analyze fields again.`
    );
  }

  async function useCurrentPage() {
    const result = (await chrome.runtime.sendMessage({
      command: 'USE_CURRENT_PAGE'
    })) as ExtensionCommandResult;
    setStatus(
      result.ok
        ? 'This page is now the target for analysis.'
        : (result.userMessage ??
            'Go back to the job or application page tab, open the assistant, then choose Use This Page.')
    );
    await loadTabStatus();
  }

  async function requestSitePermission() {
    const result = (await requestCurrentSitePermissionFromUi(
      pageStatus
    )) as PermissionRequestResult;
    setStatus(result.userMessage);
    await loadTabStatus();
  }

  async function handleCommandFailure(result: ExtensionCommandResult) {
    setStatus(result.userMessage ?? result.error ?? 'The command could not run on this page.');
    if (result.needsPermission) {
      setVerification('Site permission required before analysis can run.');
    }
    await loadTabStatus();
  }

  async function saveNotes() {
    if (!session) {
      setStatus('Analyze application fields before saving session notes.');
      return;
    }
    const saved = await saveSession({ notes });
    if (saved) setStatus('Application notes saved locally.');
  }

  async function markStatus(nextStatus: ApplicationSession['status']) {
    if (!session) {
      setStatus('No application session is available to update.');
      return;
    }
    const saved = await saveSession({
      status: nextStatus,
      submittedByUser: nextStatus === 'submitted-by-user'
    });
    if (!saved) return;
    setStatus(
      nextStatus === 'submitted-by-user'
        ? 'Marked submitted by user.'
        : 'Application marked skipped.'
    );
  }

  async function saveSession(patch: Partial<ApplicationSession>): Promise<boolean> {
    const now = new Date().toISOString();
    const pageUrl = normalizePageUrl(session?.pageUrl ?? pageStatus?.url ?? job?.sourceUrl ?? '');
    if (!pageUrl) {
      setStatus('No valid application page is available for this session.');
      return false;
    }

    const nextStatus = patch.status ?? session?.status ?? 'draft';
    const next: ApplicationSession = {
      id: session?.id ?? crypto.randomUUID(),
      job,
      jobPostingId: job?.id,
      pageUrl,
      startedAt: session?.startedAt ?? now,
      fieldPreview: patch.fieldPreview ?? session?.fieldPreview ?? preview,
      fillResults: patch.fillResults ?? session?.fillResults ?? fillResults,
      manualVerificationRequired:
        patch.manualVerificationRequired ?? session?.manualVerificationRequired ?? false,
      notes: patch.notes ?? notes,
      status: nextStatus,
      submittedByUser: nextStatus === 'submitted-by-user',
      updatedAt: now
    };
    if (!(await queueSessionWrite(next))) return false;
    setSession(next);
    return true;
  }

  async function queueSessionWrite(next: ApplicationSession): Promise<boolean> {
    if (!isValidApplicationSessionRecord(next)) {
      setStatus('The application session did not pass local persistence validation.');
      return false;
    }
    const write = sessionWriteChain.current
      .catch(() => undefined)
      .then(() => sessionRepo.save(next));
    sessionWriteChain.current = write;
    try {
      await write;
      return true;
    } catch {
      setStatus('The application session could not be saved locally.');
      return false;
    }
  }

  function clearSessionBoundState(clearJob = false) {
    setSession(undefined);
    previewRef.current = [];
    setPreview([]);
    setFillResults([]);
    setNotes('');
    setFieldSummary(undefined);
    setPageWarnings([]);
    setVerification('No manual verification detected.');
    if (clearJob) setJob(undefined);
  }

  function updatePreview(selector: string, patch: Partial<FillPreviewItem>) {
    if (!fieldSummary || fillResults.length > 0 || session?.status === 'filled') {
      setStatus('Analyze the current application fields before editing saved values.');
      return;
    }
    const nextPreview = previewRef.current.map((item) => {
      if (item.candidate.selector !== selector) return item;
      const valueChanged =
        Object.prototype.hasOwnProperty.call(patch, 'value') && patch.value !== item.value;
      return {
        ...item,
        ...patch,
        ...(valueChanged
          ? {
              approved: false,
              rejected: !patch.value,
              status: patch.value ? ('pending' as const) : ('rejected' as const)
            }
          : {})
      };
    });
    previewRef.current = nextPreview;
    setPreview(nextPreview);
    void saveSession({ fieldPreview: nextPreview });
  }

  async function approveSafeFields() {
    if (!fieldSummary || fillResults.length > 0 || session?.status === 'filled') {
      setStatus('Analyze the current application fields before approving values.');
      return;
    }
    const nextPreview = approveSafeHighConfidence(previewRef.current);
    previewRef.current = nextPreview;
    setPreview(nextPreview);
    if (await saveSession({ fieldPreview: nextPreview })) {
      setStatus(postActionMessage('safe-approved'));
    }
  }

  async function clearApprovedFields() {
    if (!fieldSummary || fillResults.length > 0 || session?.status === 'filled') {
      setStatus('Analyze the current application fields before changing approvals.');
      return;
    }
    const nextPreview = clearApprovals(previewRef.current);
    previewRef.current = nextPreview;
    setPreview(nextPreview);
    if (await saveSession({ fieldPreview: nextPreview })) {
      setStatus('Field approvals cleared.');
    }
  }

  const canOfferPermission = canOfferSitePermission(pageStatus);
  const blockedPage = !canRunPageCommand(pageStatus);
  const previewInteractive = Boolean(
    fieldSummary && fillResults.length === 0 && session?.status !== 'filled'
  );
  const freshPreview = fieldSummary ? preview : [];
  const freshFillResults = fieldSummary ? fillResults : [];
  const workflow = buildWorkflowState({
    pageStatus,
    profile,
    job,
    preview: freshPreview,
    fillResults: freshFillResults,
    manualVerificationRequired: verification.includes('required'),
    sessionStatus: session?.status
  });
  const profileHelper = profileHelperText({
    profileReady: Boolean(profile),
    jobReady: workflow.jobReady,
    fieldsReady: workflow.fieldsReady
  });
  const compactSteps = compactWorkflowSteps(workflow.steps, workflow.currentStepId);
  const primaryAction = getPrimaryAction(workflow.currentStepId, blockedPage);
  const targetStatus = buildTargetStatus(pageStatus);

  return (
    <main className="app stack">
      <section className="hero stack">
        <span className="pill">Assistant panel</span>
        <h1>Rapid Robot Job Assistant</h1>
        <div className="row">
          <span className={`status-chip ${targetStatus.tone}`}>{targetStatus.label}</span>
          <span className={`status-chip ${profile ? 'done' : 'warning'}`}>
            {profileStatusLabel(Boolean(profile))}
          </span>
        </div>
        <p>{workflow.recommendedAction}</p>
        {!profile && profileHelper !== workflow.recommendedAction && (
          <p className="muted">{profileHelper}</p>
        )}
        <div className="row">
          <button disabled={!primaryAction.enabled} onClick={primaryAction.run}>
            {primaryAction.label}
          </button>
          {!pageStatus?.ok && !pageStatus?.userMessage.includes('assistant tab') && (
            <button className="secondary" onClick={useCurrentPage}>
              Use This Page
            </button>
          )}
          {canOfferPermission && (
            <button className="secondary" onClick={requestSitePermission}>
              Allow This Site
            </button>
          )}
          {workflow.currentStepId === 'profile' && !blockedPage && !workflow.fieldsReady && (
            <button className="secondary" onClick={analyzeFields}>
              Analyze Fields
            </button>
          )}
          <button className="secondary" onClick={() => chrome.runtime.openOptionsPage()}>
            {profileActionLabel(Boolean(profile))}
          </button>
        </div>
        <p className={targetStatus.tone === 'blocked' ? 'warn' : 'muted'}>{targetStatus.helper}</p>
        {canOfferPermission && <p className="muted">Allow this site if Chrome blocks analysis.</p>}
      </section>

      <section className="status-banner card">
        <p>{status}</p>
        <p className={verification.includes('required') ? 'warn' : 'ok'}>{verification}</p>
        {pageWarnings.map((warning) => (
          <p className="warn" key={warning}>
            {warning}
          </p>
        ))}
      </section>

      {!pageStatus?.ok && pageStatus?.userMessage.includes('assistant tab') && (
        <section className="card stack">
          <h2>Live Page Work</h2>
          <p>
            Live page actions work best from the job or application page. Open that page, click the
            extension, and choose <strong>Open Assistant On This Page</strong>.
          </p>
          <div className="row">
            <button className="secondary" onClick={() => chrome.runtime.openOptionsPage()}>
              Review Profile
            </button>
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>Diagnostics</h2>
        <div className="row">
          <span className="pill">
            Browser: {browser ? browserLabel(browser.browserName) : 'Detecting'}
          </span>
          <span className="pill">Main surface: In-page assistant</span>
          <span className="pill">Side panel: {browser?.sidePanelReliability ?? 'optional'}</span>
        </div>
        {browser?.compatibilityNotes.map((note) => (
          <p className="muted" key={note}>
            {note}
          </p>
        ))}
      </section>

      {fieldSummary && (
        <section className="card">
          <h2>Field Analysis Summary</h2>
          <div className="row">
            <span className="pill">Fields found: {fieldSummary.fieldCount}</span>
            <span className="pill">Safe fill candidates: {fieldSummary.fillableCount}</span>
            <span className="pill">Manual-only: {fieldSummary.manualOnlyCount}</span>
            <span className="pill">Sensitive: {fieldSummary.sensitiveCount}</span>
            <span className="pill">Needs review: {fieldSummary.unknownCount}</span>
          </div>
        </section>
      )}

      <section className="card stack compact-workflow">
        <h2>Workflow</h2>
        <div className="workflow-rail">
          {workflow.steps.map((step) => (
            <span className={`status-chip ${statusTone(step.status)}`} key={step.id}>
              {step.label}
            </span>
          ))}
        </div>
        {compactSteps.map((step) => (
          <WorkflowStepRow key={step.id} step={step} />
        ))}
      </section>

      <section className="card stack">
        <h2>Current Task</h2>
        <p className="muted">
          {workflow.steps.find((step) => step.id === workflow.currentStepId)?.helperText}
        </p>
        <div className="row">{renderCurrentTaskControls()}</div>
      </section>

      <details className="card stack">
        <summary>How this works</summary>
        <ol className="compact-list">
          <li>Analyze the job page.</li>
          <li>Import or review your profile before filling.</li>
          <li>Analyze the application form.</li>
          <li>Review suggested values.</li>
          <li>Approve only safe fields.</li>
          <li>Fill approved fields.</li>
          <li>Submit manually yourself.</li>
        </ol>
      </details>

      <section className="grid two">
        <Card title="Job Summary">
          <p>{job?.title ?? 'No job analyzed yet.'}</p>
          <p className="muted">
            {[job?.company, job?.location, job?.remoteStatus, job?.salaryText]
              .filter(Boolean)
              .join(' | ')}
          </p>
        </Card>
        <Card title="Session">
          <p>{session ? `Session saved for ${session.pageUrl}` : 'No application session yet.'}</p>
          <p className="muted">
            {session ? `Status: ${session.status}` : 'Analyze fields to start one.'}
          </p>
        </Card>
      </section>

      <section className="card stack">
        <h2>Fill Preview</h2>
        <p className="muted">
          Edit values, approve safe fields, and skip anything unclear. Sensitive and file fields are
          not bulk-approved.
        </p>
        {preview.length === 0 && <p className="muted">No fields analyzed yet.</p>}
        {preview.length > 0 && !previewInteractive && (
          <p className="warn">
            This is saved or completed field history. Analyze the current form before editing,
            approving, or filling again.
          </p>
        )}
        {preview.map((item) => (
          <div className="field-row" key={item.candidate.selector}>
            <div>
              <strong>
                {item.candidate.labelText ||
                  item.candidate.ariaLabel ||
                  item.candidate.placeholder ||
                  item.candidate.name ||
                  item.candidate.selector}
              </strong>
              <p className="muted">
                {item.kind} | {item.candidate.inputType ?? item.candidate.tagName} |{' '}
                {confidenceLabel(item.confidence)} ({Math.round(item.confidence * 100)}%)
              </p>
              <div className="row">
                {item.status === 'manual-only' && <span className="pill">Manual-only</span>}
                {item.sensitive && <span className="pill">Sensitive</span>}
                {item.candidate.disabled && <span className="pill">Disabled</span>}
                {item.candidate.readOnly && <span className="pill">Read-only</span>}
                {item.candidate.candidateSource === 'aria-widget' && (
                  <span className="pill">Custom widget</span>
                )}
                {!item.value && <span className="pill">No saved value</span>}
              </div>
              <p className={item.sensitive ? 'warn' : 'muted'}>
                {[item.warning, item.explanation].filter(Boolean).join(' ')}
              </p>
            </div>
            <input
              value={item.value ?? ''}
              disabled={!previewInteractive || item.status === 'manual-only'}
              onChange={(event) =>
                updatePreview(item.candidate.selector, { value: event.target.value })
              }
              placeholder="No saved value"
            />
            <div className="row">
              <label>
                <input
                  type="checkbox"
                  checked={item.approved}
                  disabled={
                    !previewInteractive ||
                    !item.value ||
                    item.status === 'manual-only' ||
                    item.sensitive ||
                    !item.candidate.visible ||
                    item.candidate.disabled ||
                    item.candidate.readOnly ||
                    item.candidate.stableSelector === false
                  }
                  onChange={(event) =>
                    updatePreview(item.candidate.selector, {
                      approved: event.target.checked,
                      rejected: !event.target.checked,
                      status: event.target.checked ? 'approved' : 'pending'
                    })
                  }
                />{' '}
                Approve
              </label>
              <button
                className="secondary"
                disabled={!previewInteractive}
                onClick={() =>
                  updatePreview(item.candidate.selector, {
                    approved: false,
                    rejected: true,
                    status: 'rejected'
                  })
                }
              >
                Skip
              </button>
              <span className="pill">{item.status ?? 'pending'}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>Fill Results</h2>
        {fillResults.length === 0 ? (
          <p className="muted">No fill results yet.</p>
        ) : (
          fillResults.map((result) => (
            <p key={result.selector} className={result.ok ? 'ok' : 'warn'}>
              {result.selector}: {result.message}
            </p>
          ))
        )}
      </section>

      <section className="card stack">
        <h2>Application Notes</h2>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Private local notes for this application."
        />
        <button className="secondary" disabled={!session} onClick={saveNotes}>
          Save Notes
        </button>
      </section>
    </main>
  );

  function getPrimaryAction(stepId: string, pageBlocked: boolean) {
    if (stepId === 'analyze-job') {
      return { label: 'Analyze Job', enabled: !pageBlocked, run: analyzeJob };
    }
    if (stepId === 'profile') {
      return {
        label: profileActionLabel(Boolean(profile)),
        enabled: true,
        run: () => chrome.runtime.openOptionsPage()
      };
    }
    if (stepId === 'analyze-fields') {
      return { label: 'Analyze Fields', enabled: !pageBlocked, run: analyzeFields };
    }
    if (stepId === 'review') {
      return {
        label: 'Approve Safe Fields',
        enabled: previewInteractive && preview.length > 0,
        run: approveSafeFields
      };
    }
    if (stepId === 'fill') {
      return {
        label: 'Fill Approved',
        enabled: !pageBlocked && previewInteractive && preview.some((item) => item.approved),
        run: fillApproved
      };
    }
    return { label: 'Review and Submit Manually', enabled: false, run: () => undefined };
  }

  function renderCurrentTaskControls() {
    if (workflow.currentStepId === 'analyze-job') {
      return (
        <>
          <button disabled={blockedPage} onClick={analyzeJob}>
            Analyze Job
          </button>
          <button className="secondary" onClick={useCurrentPage}>
            Use This Page
          </button>
        </>
      );
    }
    if (workflow.currentStepId === 'profile') {
      return (
        <>
          <button onClick={() => chrome.runtime.openOptionsPage()}>
            {profileActionLabel(Boolean(profile))}
          </button>
          {!workflow.fieldsReady && (
            <button className="secondary" disabled={blockedPage} onClick={analyzeFields}>
              Analyze Fields
            </button>
          )}
        </>
      );
    }
    if (workflow.currentStepId === 'analyze-fields') {
      return (
        <button disabled={blockedPage} onClick={analyzeFields}>
          Analyze Fields
        </button>
      );
    }
    if (workflow.currentStepId === 'review') {
      return (
        <>
          <button
            disabled={!previewInteractive || preview.length === 0}
            onClick={() => {
              void approveSafeFields();
            }}
          >
            Approve Safe Fields
          </button>
          <button
            className="secondary"
            disabled={!previewInteractive || preview.length === 0}
            onClick={() => void clearApprovedFields()}
          >
            Clear Approvals
          </button>
        </>
      );
    }
    if (workflow.currentStepId === 'fill') {
      return (
        <button
          disabled={blockedPage || !previewInteractive || !preview.some((item) => item.approved)}
          onClick={fillApproved}
        >
          Fill Approved
        </button>
      );
    }
    return (
      <>
        <button
          className="secondary"
          disabled={!session}
          onClick={() => markStatus('submitted-by-user')}
        >
          Mark Submitted
        </button>
        <button className="secondary" disabled={!session} onClick={() => markStatus('skipped')}>
          Mark Skipped
        </button>
      </>
    );
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function WorkflowStepRow({ step }: { step: WorkflowStep }) {
  return (
    <div className={`workflow-step compact ${step.status}`}>
      <span className={`status-chip ${statusTone(step.status)}`}>{step.status}</span>
      <strong>{step.label}</strong>
      <span className="muted">{step.helperText}</span>
    </div>
  );
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'High confidence';
  if (confidence >= 0.7) return 'Review needed';
  return 'Low confidence';
}

function buildTargetStatus(status: TabCapabilityResult | undefined): {
  label: string;
  helper: string;
  tone: 'done' | 'warning' | 'blocked';
} {
  if (!status) {
    return {
      label: 'Target page loading',
      helper: 'Current target page status will appear here.',
      tone: 'warning'
    };
  }
  if (status.ok && status.url) {
    return {
      label: `Target page: ${safeHost(status.url)}`,
      helper: status.userMessage,
      tone: 'done'
    };
  }
  if (status.userMessage.includes('assistant tab')) {
    return {
      label: 'No target page selected',
      helper: 'The assistant tab needs a saved target page before analysis.',
      tone: 'warning'
    };
  }
  return {
    label: 'Target page unavailable',
    helper: status.userMessage,
    tone: status.isRestricted ? 'blocked' : 'warning'
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'saved page';
  }
}
