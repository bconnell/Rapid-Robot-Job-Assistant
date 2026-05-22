import { useEffect, useState } from 'react';
import type {
  ExtensionCommandResult,
  PermissionRequestResult
} from '../shared/extension/ExtensionMessaging';
import type { TabCapabilityResult } from '../shared/extension/TabPermissions';
import { ChromeStorageRepository } from '../shared/storage/ChromeStorageRepository';
import { ProfileRepository } from '../shared/storage/TypedRepositories';

export function PopupApp() {
  const [status, setStatus] = useState<TabCapabilityResult>();
  const [message, setMessage] = useState('Ready. Nothing is submitted automatically.');
  const [profileStatus, setProfileStatus] = useState('Checking active profile...');

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
    const profile = profileId ? await new ProfileRepository().get(profileId) : undefined;
    setProfileStatus(
      profile
        ? `Active profile: ${profile.contact.fullName ?? profile.contact.email ?? 'Saved profile'}`
        : 'No active profile saved yet.'
    );
  }

  async function run(command: string, done: string) {
    const result = (await chrome.runtime.sendMessage({ command })) as ExtensionCommandResult;
    setMessage(result.ok ? done : (result.userMessage ?? result.error ?? 'Command could not run.'));
    if (!result.ok) await loadTabStatus();
  }

  async function requestSitePermission() {
    const result = (await chrome.runtime.sendMessage({
      command: 'REQUEST_CURRENT_SITE_PERMISSION'
    })) as ExtensionCommandResult<PermissionRequestResult>;
    setMessage(
      result.data?.userMessage ??
        result.userMessage ??
        'Permission was not granted. Analysis cannot run on this site until permission is allowed.'
    );
    await loadTabStatus();
  }

  const isBlocked = status ? !status.ok : true;
  const needsPermission = Boolean(status?.needsPermission && status.canRequestPermission);
  const canAnalyze = Boolean(status?.ok);

  return (
    <main className="app stack">
      <section className="hero">
        <span className="pill ok">Local-first</span>
        <h1>Rapid Robot Job Assistant</h1>
        <p className="muted">Analyze, review, approve, then fill. No auto-submit.</p>
      </section>

      <section className="card stack">
        <h2>Current Page</h2>
        <p className={status?.ok ? 'ok' : needsPermission ? 'warn' : 'danger-text'}>
          {status?.userMessage ?? 'Open a normal web page before analyzing.'}
        </p>
        <p className="muted">{status?.url ?? 'Open a job page or application page to begin.'}</p>
        {needsPermission && <button onClick={requestSitePermission}>Allow This Site</button>}
      </section>

      <section className="grid">
        <button onClick={() => run('OPEN_SIDE_PANEL', 'Side panel opened.')}>
          Open Side Panel
        </button>
        <button
          disabled={isBlocked}
          onClick={() => run('ANALYZE_CURRENT_JOB_PAGE', 'Job page analyzed.')}
        >
          Analyze Current Job Page
        </button>
        <button
          disabled={isBlocked}
          onClick={() => run('ANALYZE_APPLICATION_FIELDS', 'Application fields analyzed.')}
        >
          Analyze Application Fields
        </button>
        <button className="secondary" onClick={() => chrome.runtime.openOptionsPage()}>
          Import or Review Profile
        </button>
      </section>

      <section className="card">
        <p className="ok">Privacy status: local-only mode is the default.</p>
        <p className={profileStatus.startsWith('No') ? 'warn' : 'ok'}>{profileStatus}</p>
        {!canAnalyze && (
          <p className="muted">
            Analysis runs only on normal web pages after this site is allowed.
          </p>
        )}
        <p className="muted">{message}</p>
      </section>
    </main>
  );
}
