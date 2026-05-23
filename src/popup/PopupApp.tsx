import { useEffect, useState } from 'react';
import type {
  ExtensionCommandResult,
  OpenWorkspaceResult,
  PermissionRequestResult
} from '../shared/extension/ExtensionMessaging';
import { requestCurrentSitePermissionFromUi } from '../shared/extension/PermissionRequestClient';
import type { TabCapabilityResult } from '../shared/extension/TabPermissions';
import { canOfferSitePermission, canRunPageCommand } from '../shared/extension/TabPermissions';
import { ChromeStorageRepository } from '../shared/storage/ChromeStorageRepository';
import { ProfileRepository } from '../shared/storage/TypedRepositories';
import type { UserProfile } from '../shared/models/UserProfile';
import {
  buildWorkflowState,
  postActionMessage,
  profileActionLabel
} from '../shared/workflow/WorkflowState';

export function PopupApp() {
  const [status, setStatus] = useState<TabCapabilityResult>();
  const [message, setMessage] = useState('Ready. Nothing is submitted automatically.');
  const [profile, setProfile] = useState<UserProfile>();
  const [jobAnalyzed, setJobAnalyzed] = useState(false);
  const [fieldsAnalyzed, setFieldsAnalyzed] = useState(false);

  useEffect(() => {
    void loadTabStatus();
    void loadProfileStatus();
  }, []);

  async function loadTabStatus() {
    const result = (await chrome.runtime.sendMessage({
      command: 'GET_CURRENT_TAB_STATUS'
    })) as ExtensionCommandResult<TabCapabilityResult>;
    setStatus(result.data ?? result.response);
  }

  async function loadProfileStatus() {
    const storage = new ChromeStorageRepository();
    const profileId = await storage.getActiveProfileId();
    const active = profileId ? await new ProfileRepository().get(profileId) : undefined;
    setProfile(active);
  }

  async function runAnalyzeJob() {
    const result = (await chrome.runtime.sendMessage({
      command: 'ANALYZE_CURRENT_JOB_PAGE'
    })) as ExtensionCommandResult;
    if (result.ok) {
      setJobAnalyzed(true);
      setMessage(postActionMessage('job-analyzed', Boolean(profile)));
    } else {
      setMessage(result.userMessage ?? result.error ?? 'Job analysis could not run.');
      await loadTabStatus();
    }
  }

  async function runAnalyzeFields() {
    const result = (await chrome.runtime.sendMessage({
      command: 'ANALYZE_APPLICATION_FIELDS'
    })) as ExtensionCommandResult;
    if (result.ok) {
      setFieldsAnalyzed(true);
      setMessage(postActionMessage('fields-analyzed'));
    } else {
      setMessage(result.userMessage ?? result.error ?? 'Field analysis could not run.');
      await loadTabStatus();
    }
  }

  async function openSidePanel() {
    const result = (await chrome.runtime.sendMessage({
      command: 'OPEN_SIDE_PANEL'
    })) as ExtensionCommandResult<OpenWorkspaceResult>;
    const response = result.data ?? result.response;
    setMessage(
      result.ok
        ? (response?.userMessage ?? 'Assistant workspace opened.')
        : (result.userMessage ??
            response?.userMessage ??
            'Side panel could not open. You can open the assistant workspace in a tab.')
    );
  }

  async function openWorkspaceTab() {
    const result = (await chrome.runtime.sendMessage({
      command: 'OPEN_WORKSPACE_TAB'
    })) as ExtensionCommandResult<OpenWorkspaceResult>;
    const response = result.data ?? result.response;
    setMessage(result.userMessage ?? response?.userMessage ?? 'Workspace tab opened.');
  }

  async function requestSitePermission() {
    const result = (await requestCurrentSitePermissionFromUi(status)) as PermissionRequestResult;
    setMessage(result.userMessage);
    await loadTabStatus();
  }

  function openProfile() {
    chrome.runtime.openOptionsPage();
    setMessage(
      profile
        ? 'Review your saved profile when needed.'
        : 'Create or import a profile before filling.'
    );
  }

  const canAnalyze = canRunPageCommand(status);
  const canOfferPermission = canOfferSitePermission(status);
  const workflow = buildWorkflowState({
    pageStatus: status,
    profile,
    job: jobAnalyzed ? ({ id: 'popup-job' } as never) : undefined,
    preview: fieldsAnalyzed ? ([{ approved: false }] as never) : []
  });
  const primaryAction = getPrimaryAction(workflow.currentStepId, canAnalyze);

  return (
    <main className="app stack">
      <section className="hero stack">
        <span className="pill ok">Local-first</span>
        <h1>Rapid Robot Job Assistant</h1>
        <p className="muted">Analyze, review, approve, then fill. No auto-submit.</p>
      </section>

      <section className="card stack">
        <div className="row">
          <StatusChip
            label={status?.ok ? 'Page ready' : 'Page blocked'}
            tone={status?.ok ? 'done' : 'blocked'}
          />
          <StatusChip
            label={profile ? 'Profile ready' : 'Profile not ready'}
            tone={profile ? 'done' : 'warning'}
          />
        </div>
        <h2>Recommended Next Step</h2>
        <p>{workflow.recommendedAction}</p>
        {!profile && (
          <p className="muted">
            You can analyze a job page first. A saved profile is needed before filling applications.
          </p>
        )}
        <button disabled={!primaryAction.enabled} onClick={primaryAction.run}>
          {primaryAction.label}
        </button>
      </section>

      <section className="card stack">
        <h2>Workflow</h2>
        {workflow.steps.map((step) => (
          <div className={`workflow-step ${step.status}`} key={step.id}>
            <span className={`status-chip ${statusClass(step.status)}`}>{step.status}</span>
            <div>
              <strong>{step.label}</strong>
              <p className="muted">{step.helperText}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2>Current Page</h2>
        <p className={status?.ok ? 'ok' : 'danger-text'}>
          {status?.userMessage ?? 'Open a normal web page before analyzing.'}
        </p>
        <p className="muted">{status?.url ?? 'Open a job page or application page to begin.'}</p>
        {canOfferPermission && <button onClick={requestSitePermission}>Allow This Site</button>}
      </section>

      <section className="card stack">
        <h2>Actions</h2>
        <button className="secondary" onClick={openSidePanel}>
          Open Workspace
        </button>
        <button className="secondary" onClick={openWorkspaceTab}>
          Open Workspace In Tab
        </button>
        <button className="secondary" onClick={openProfile}>
          {profileActionLabel(Boolean(profile))}
        </button>
        <button className="secondary" disabled={!canAnalyze} onClick={runAnalyzeJob}>
          Analyze Job
        </button>
        <button className="secondary" disabled={!canAnalyze} onClick={runAnalyzeFields}>
          Analyze Fields
        </button>
      </section>

      <section className="card">
        <p className="ok">Privacy status: local-only mode is the default.</p>
        <p className="muted">{message}</p>
      </section>
    </main>
  );

  function getPrimaryAction(stepId: string, canRunAnalysis: boolean) {
    if (stepId === 'analyze-job') {
      return { label: 'Analyze Job Page', enabled: canRunAnalysis, run: runAnalyzeJob };
    }
    if (stepId === 'profile') {
      return { label: profileActionLabel(Boolean(profile)), enabled: true, run: openProfile };
    }
    if (stepId === 'analyze-fields') {
      return {
        label: 'Analyze Application Fields',
        enabled: canRunAnalysis,
        run: runAnalyzeFields
      };
    }
    return { label: 'Open Workspace', enabled: true, run: openSidePanel };
  }
}

function StatusChip({ label, tone }: { label: string; tone: 'done' | 'warning' | 'blocked' }) {
  return <span className={`status-chip ${tone}`}>{label}</span>;
}

function statusClass(status: string): string {
  if (status === 'done' || status === 'ready') return 'done';
  if (status === 'blocked') return 'blocked';
  return 'warning';
}
