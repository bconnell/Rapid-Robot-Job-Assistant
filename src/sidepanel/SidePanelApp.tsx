import { useEffect, useState } from 'react';
import type { ApplicationSession } from '../shared/models/ApplicationSession';
import type { FillPreviewItem, FillResult } from '../shared/models/FieldMapping';
import type { JobPosting } from '../shared/models/JobPosting';
import type { UserProfile } from '../shared/models/UserProfile';
import type {
  ExtensionCommandResult,
  PermissionRequestResult
} from '../shared/extension/ExtensionMessaging';
import { requestCurrentSitePermissionFromUi } from '../shared/extension/PermissionRequestClient';
import type { TabCapabilityResult } from '../shared/extension/TabPermissions';
import { canOfferSitePermission, canRunPageCommand } from '../shared/extension/TabPermissions';
import { approveSafeHighConfidence, clearApprovals } from '../shared/fill/FillApprovalRules';
import { buildFillPreview } from '../shared/fill/ProfileValueResolver';
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

  useEffect(() => {
    void loadActiveProfile();
    void loadTabStatus();
  }, []);

  async function loadTabStatus() {
    const result = (await chrome.runtime.sendMessage({
      command: 'GET_CURRENT_TAB_STATUS'
    })) as ExtensionCommandResult<TabCapabilityResult>;
    const nextStatus = result.data ?? result.response;
    setPageStatus(nextStatus);
    if (nextStatus && !nextStatus.ok) setStatus(nextStatus.userMessage);
  }

  async function loadActiveProfile() {
    const id = await settingsRepo.getActiveProfileId();
    const active = id ? await profileRepo.get(id) : undefined;
    setProfile(active);
    if (!active) setStatus('Profile needed before filling. You can analyze a job first.');
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
    if (!analyzed) {
      setStatus('No job data returned from the current page.');
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
    if (!response?.pageUrl) {
      setStatus('No field data returned from the current page.');
      return;
    }
    const nextPreview = buildFillPreview(response?.mappings ?? [], profile);
    const nextWarnings = [...(response.warnings ?? []), ...(response.iframeWarnings ?? [])].filter(
      (warning, index, all) => all.indexOf(warning) === index
    );
    const nextSummary = {
      fieldCount: response.fieldCount ?? nextPreview.length,
      fillableCount: response.fillableCount ?? nextPreview.filter((item) => item.fillable).length,
      manualOnlyCount:
        response.manualOnlyCount ??
        nextPreview.filter((item) => item.status === 'manual-only').length,
      sensitiveCount:
        response.sensitiveCount ?? nextPreview.filter((item) => item.sensitive).length,
      unknownCount:
        response.unknownCount ?? nextPreview.filter((item) => item.kind === 'unknown').length
    };
    const pageUrl = response.pageUrl;
    const existing = await sessionRepo.findByPageUrl(pageUrl);
    const now = new Date().toISOString();
    const nextSession: ApplicationSession = {
      id: existing?.id ?? crypto.randomUUID(),
      job,
      jobPostingId: job?.id,
      pageUrl,
      startedAt: existing?.startedAt ?? now,
      fieldPreview: nextPreview,
      fillResults: existing?.fillResults ?? [],
      manualVerificationRequired: Boolean(response?.verification?.detected),
      notes: existing?.notes ?? notes,
      status: response?.verification?.detected ? 'manual-verification' : 'draft',
      submittedByUser: existing?.submittedByUser ?? false,
      updatedAt: now
    };
    await sessionRepo.save(nextSession);
    setSession(nextSession);
    setPreview(nextPreview);
    setFieldSummary(nextSummary);
    setPageWarnings(nextWarnings);
    setNotes(nextSession.notes);
    setFillResults(nextSession.fillResults);
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
    if (!preview.some((item) => item.approved)) {
      setStatus('Approve at least one safe field before filling.');
      return;
    }
    const result = (await chrome.runtime.sendMessage({
      command: 'FILL_APPROVED_FIELDS',
      payload: preview
    })) as ExtensionCommandResult<{
      verification?: { detected?: boolean };
      results?: FillResult[];
    }>;
    if (!result.ok) {
      await handleCommandFailure(result);
      return;
    }
    const response = result.data ?? result.response;
    if (response?.verification?.detected) {
      setVerification('Manual verification required. Filling paused.');
      setStatus('CAPTCHA or bot check detected. Finish it manually, then analyze fields again.');
      await saveSession({ manualVerificationRequired: true, status: 'manual-verification' });
      return;
    }
    const results = response?.results ?? [];
    const nextPreview = preview.map((item) => {
      const fillResult = results.find(
        (candidate) => candidate.selector === item.candidate.selector
      );
      return fillResult
        ? { ...item, status: fillResult.ok ? ('filled' as const) : ('failed' as const) }
        : item;
    });
    setPreview(nextPreview);
    setFillResults(results);
    await saveSession({ fieldPreview: nextPreview, fillResults: results, status: 'filled' });
    setStatus(postActionMessage('filled'));
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
    await saveSession({ notes });
    setStatus('Application notes saved locally.');
  }

  async function markStatus(nextStatus: ApplicationSession['status']) {
    await saveSession({ status: nextStatus, submittedByUser: nextStatus === 'submitted-by-user' });
    setStatus(
      nextStatus === 'submitted-by-user'
        ? 'Marked submitted by user.'
        : 'Application marked skipped.'
    );
  }

  async function saveSession(patch: Partial<ApplicationSession>) {
    const now = new Date().toISOString();
    const pageUrl = session?.pageUrl ?? job?.sourceUrl ?? 'unknown-page';
    const next: ApplicationSession = {
      id: session?.id ?? crypto.randomUUID(),
      job,
      jobPostingId: job?.id,
      pageUrl,
      startedAt: session?.startedAt ?? now,
      fieldPreview: patch.fieldPreview ?? preview,
      fillResults: patch.fillResults ?? fillResults,
      manualVerificationRequired:
        patch.manualVerificationRequired ?? session?.manualVerificationRequired ?? false,
      notes: patch.notes ?? notes,
      status: patch.status ?? session?.status ?? 'draft',
      submittedByUser: patch.submittedByUser ?? session?.submittedByUser ?? false,
      updatedAt: now
    };
    await sessionRepo.save(next);
    setSession(next);
  }

  function updatePreview(selector: string, patch: Partial<FillPreviewItem>) {
    setPreview((items) =>
      items.map((item) => (item.candidate.selector === selector ? { ...item, ...patch } : item))
    );
  }

  const canOfferPermission = canOfferSitePermission(pageStatus);
  const blockedPage = !canRunPageCommand(pageStatus);
  const workflow = buildWorkflowState({
    pageStatus,
    profile,
    job,
    preview,
    fillResults,
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
          {(!pageStatus?.ok || pageStatus.userMessage.includes('assistant tab')) && (
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
              disabled={item.status === 'manual-only'}
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
        <button className="secondary" onClick={saveNotes}>
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
        enabled: preview.length > 0,
        run: () => {
          setPreview(approveSafeHighConfidence(preview));
          setStatus(postActionMessage('safe-approved'));
        }
      };
    }
    if (stepId === 'fill') {
      return {
        label: 'Fill Approved',
        enabled: !pageBlocked && preview.some((item) => item.approved),
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
            disabled={preview.length === 0}
            onClick={() => {
              setPreview(approveSafeHighConfidence(preview));
              setStatus(postActionMessage('safe-approved'));
            }}
          >
            Approve Safe Fields
          </button>
          <button
            className="secondary"
            disabled={preview.length === 0}
            onClick={() => setPreview(clearApprovals(preview))}
          >
            Clear Approvals
          </button>
        </>
      );
    }
    if (workflow.currentStepId === 'fill') {
      return (
        <button
          disabled={blockedPage || !preview.some((item) => item.approved)}
          onClick={fillApproved}
        >
          Fill Approved
        </button>
      );
    }
    return (
      <>
        <button className="secondary" onClick={() => markStatus('submitted-by-user')}>
          Mark Submitted
        </button>
        <button className="secondary" onClick={() => markStatus('skipped')}>
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
