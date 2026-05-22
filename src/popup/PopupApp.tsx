import { useEffect, useState } from 'react';
import { ChromeStorageRepository } from '../shared/storage/ChromeStorageRepository';
import { ProfileRepository } from '../shared/storage/TypedRepositories';

interface TabStatus {
  title?: string;
  url?: string;
}

export function PopupApp() {
  const [status, setStatus] = useState<TabStatus>({});
  const [message, setMessage] = useState('Ready. Nothing is submitted automatically.');
  const [profileStatus, setProfileStatus] = useState('Checking active profile...');

  useEffect(() => {
    void chrome.runtime
      .sendMessage({ command: 'GET_CURRENT_TAB_STATUS' })
      .then((result) => setStatus(result.tab ?? {}));
    void loadProfileStatus();
  }, []);

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
    const result = await chrome.runtime.sendMessage({ command });
    setMessage(result.ok ? done : result.error);
  }

  return (
    <main className="app stack">
      <section className="hero">
        <span className="pill ok">Local-first</span>
        <h1>Rapid Robot Job Assistant</h1>
        <p className="muted">Analyze, review, approve, then fill. No auto-submit.</p>
      </section>

      <section className="card stack">
        <h2>Current Page</h2>
        <p>{status.title ?? 'No active page title available.'}</p>
        <p className="muted">{status.url ?? 'Open a job page or application page to begin.'}</p>
      </section>

      <section className="grid">
        <button onClick={() => run('OPEN_SIDE_PANEL', 'Side panel opened.')}>
          Open Side Panel
        </button>
        <button onClick={() => run('ANALYZE_CURRENT_JOB_PAGE', 'Job page analyzed.')}>
          Analyze Current Job Page
        </button>
        <button onClick={() => run('ANALYZE_APPLICATION_FIELDS', 'Application fields analyzed.')}>
          Analyze Application Fields
        </button>
        <button className="secondary" onClick={() => chrome.runtime.openOptionsPage()}>
          Import or Review Profile
        </button>
      </section>

      <section className="card">
        <p className="ok">Privacy status: local-only mode is the default.</p>
        <p className={profileStatus.startsWith('No') ? 'warn' : 'ok'}>{profileStatus}</p>
        <p className="muted">{message}</p>
      </section>
    </main>
  );
}
