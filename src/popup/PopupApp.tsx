import { useEffect, useState } from 'react';
import type {
  ExtensionCommandResult,
  OpenAssistantResult,
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
  compactWorkflowSteps,
  profileActionLabel,
  profileHelperText,
  profileStatusLabel,
  statusTone
} from '../shared/workflow/WorkflowState';

export function PopupApp() {
  const [status, setStatus] = useState<TabCapabilityResult>();
  const [message, setMessage] = useState('Ready. Nothing is submitted automatically.');
  const [profile, setProfile] = useState<UserProfile>();

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

  async function openAssistant() {
    const result = (await chrome.runtime.sendMessage({
      command: 'OPEN_IN_PAGE_ASSISTANT'
    })) as ExtensionCommandResult<OpenAssistantResult>;
    const response = result.data ?? result.response;
    setMessage(result.userMessage ?? response?.userMessage ?? 'Assistant opened on this page.');
  }

  async function openFullAssistant() {
    const result = (await chrome.runtime.sendMessage({
      command: 'OPEN_ASSISTANT'
    })) as ExtensionCommandResult<OpenAssistantResult>;
    const response = result.data ?? result.response;
    setMessage(result.userMessage ?? response?.userMessage ?? 'Full assistant opened.');
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
    profile
  });
  const primaryAction = getPrimaryAction(workflow.currentStepId, canAnalyze);
  const profileHelper = profileHelperText({
    profileReady: Boolean(profile),
    jobReady: workflow.jobReady,
    fieldsReady: workflow.fieldsReady
  });
  const compactSteps = compactWorkflowSteps(workflow.steps, workflow.currentStepId);
  const pageHost = status?.url ? safeHost(status.url) : undefined;

  return (
    <main className="app stack">
      <section className="hero stack popup-hero">
        <div className="row">
          <span className="pill ok">Local-first</span>
          <span className="pill">No auto-submit</span>
        </div>
        <h1>Rapid Robot Job Assistant</h1>
        <div className="row">
          <StatusChip
            label={status?.ok ? 'Page ready' : 'Page blocked'}
            tone={status?.ok ? 'done' : 'blocked'}
          />
          <StatusChip
            label={profileStatusLabel(Boolean(profile))}
            tone={profile ? 'done' : 'warning'}
          />
        </div>
        <p className="muted">
          {pageHost ? `Current page: ${pageHost}` : 'Open a job page to begin.'}
        </p>
        {canOfferPermission && (
          <div className="mini-card stack">
            <p className="muted">Allow this site if Chrome blocks analysis.</p>
            <button className="secondary" onClick={requestSitePermission}>
              Allow This Site
            </button>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Recommended Next Step</h2>
        <p>{workflow.recommendedAction}</p>
        {!profile && profileHelper !== workflow.recommendedAction && (
          <p className="muted">{profileHelper}</p>
        )}
        <button disabled={!primaryAction.enabled} onClick={primaryAction.run}>
          {primaryAction.label}
        </button>
        <div className="row">
          <button className="secondary" onClick={openFullAssistant}>
            Open Full Assistant
          </button>
          <button className="secondary" onClick={openProfile}>
            {profileActionLabel(Boolean(profile))}
          </button>
        </div>
      </section>

      <section className="card stack compact-workflow">
        <h2>How It Works</h2>
        <div className="flow-guide" aria-label="Application flow">
          <span>Job</span>
          <span>Profile</span>
          <span>Fields</span>
          <span>Review</span>
          <span>Fill</span>
          <span>Submit manually</span>
        </div>
        {compactSteps.map((step) => (
          <div className={`workflow-step ${step.status}`} key={step.id}>
            <span className={`status-chip ${statusTone(step.status)}`}>{step.status}</span>
            <div>
              <strong>{step.label}</strong>
              <p className="muted">{step.helperText}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <p className="ok">Privacy status: local-only mode is the default.</p>
        <p className="muted">{message}</p>
      </section>
    </main>
  );

  function getPrimaryAction(stepId: string, canRunAnalysis: boolean) {
    void stepId;
    return { label: 'Open Assistant On This Page', enabled: canRunAnalysis, run: openAssistant };
  }
}

function StatusChip({ label, tone }: { label: string; tone: 'done' | 'warning' | 'blocked' }) {
  return <span className={`status-chip ${tone}`}>{label}</span>;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'saved page';
  }
}
