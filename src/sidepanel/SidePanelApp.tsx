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
    if (!active) setStatus('No active profile selected. Open Options and save a profile first.');
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
    setStatus(
      saved.created
        ? 'Job analyzed and saved locally.'
        : 'Job analyzed and existing saved job updated.'
    );
  }

  async function analyzeFields() {
    const result = (await chrome.runtime.sendMessage({
      command: 'ANALYZE_APPLICATION_FIELDS'
    })) as ExtensionCommandResult<{
      pageUrl?: string;
      mappings?: Parameters<typeof buildFillPreview>[0];
      verification?: { detected?: boolean };
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
    setNotes(nextSession.notes);
    setFillResults(nextSession.fillResults);
    setVerification(
      nextSession.manualVerificationRequired
        ? 'Manual verification required.'
        : 'No manual verification detected.'
    );
    setStatus(`${nextPreview.length} fields detected. Review values before filling.`);
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
    setStatus('Fill finished. Review the page before submitting anything yourself.');
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

  return (
    <main className="app stack">
      <section className="hero">
        <span className="pill">Review-first workflow</span>
        <h1>Rapid Robot Job Assistant</h1>
        <p className={profile ? 'ok' : 'warn'}>
          {profile
            ? `Active profile: ${profile.contact.fullName ?? profile.contact.email ?? 'Saved profile'}`
            : 'No active profile selected.'}
        </p>
        <p className={pageStatus?.ok ? 'ok' : 'muted'}>
          {pageStatus?.userMessage ?? 'Current page status will appear here.'}
        </p>
        <div className="row">
          {canOfferPermission && <button onClick={requestSitePermission}>Allow This Site</button>}
          <button disabled={blockedPage} onClick={analyzeJob}>
            Analyze Job Page
          </button>
          <button className="secondary" disabled={blockedPage} onClick={analyzeFields}>
            Analyze Fields
          </button>
          <button
            className="secondary"
            onClick={() => setPreview(approveSafeHighConfidence(preview))}
          >
            Approve Safe High-Confidence
          </button>
          <button className="secondary" onClick={() => setPreview(clearApprovals(preview))}>
            Clear Approvals
          </button>
          <button disabled={blockedPage} onClick={fillApproved}>
            Fill Approved Fields
          </button>
        </div>
      </section>

      <section className="status-banner card">
        <p>{status}</p>
        <p className={verification.includes('required') ? 'warn' : 'ok'}>{verification}</p>
      </section>

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
          <div className="row">
            <button className="secondary" onClick={() => markStatus('submitted-by-user')}>
              Submitted Myself
            </button>
            <button className="secondary" onClick={() => markStatus('skipped')}>
              Skipped
            </button>
          </div>
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
                {Math.round(item.confidence * 100)}%
              </p>
              <p className={item.sensitive ? 'warn' : 'muted'}>
                {item.warning || item.explanation}
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
                    !item.candidate.visible
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
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
