import { useEffect, useState } from 'react';
import {
  ChromeStorageRepository,
  defaultSettings,
  type ExtensionSettings
} from '../shared/storage/ChromeStorageRepository';
import { clearAllIndexedDbData, IndexedDbRepository } from '../shared/storage/IndexedDbRepository';
import { extractPlainTextFromPaste } from '../shared/parsing/ResumeTextExtractor';
import { parseResumeSections } from '../shared/parsing/ResumeSectionParser';
import type { UserProfile } from '../shared/models/UserProfile';

const settingsRepo = new ChromeStorageRepository();
const profileRepo = new IndexedDbRepository('profiles');

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [resumeText, setResumeText] = useState('');
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [status, setStatus] = useState('Local-only mode is on by default.');

  useEffect(() => {
    void settingsRepo.getSettings().then(setSettings);
  }, []);

  async function saveSettings(next: ExtensionSettings) {
    setSettings(next);
    await settingsRepo.saveSettings(next);
    setStatus('Settings saved locally.');
  }

  async function parseAndSaveProfile() {
    const extracted = extractPlainTextFromPaste(resumeText);
    if (!extracted.ok) {
      setStatus(extracted.error);
      return;
    }
    const parsed = parseResumeSections(extracted.value);
    setProfile(parsed.profile);
    await profileRepo.put(parsed.profile.id, parsed.profile);
    setStatus(
      parsed.warnings.length
        ? parsed.warnings.map((warning) => warning.message).join(' ')
        : 'Profile saved locally.'
    );
  }

  async function clearLocalData() {
    await settingsRepo.clearSettings();
    await clearAllIndexedDbData();
    setSettings(defaultSettings);
    setProfile(undefined);
    setResumeText('');
    setStatus('Local extension data cleared.');
  }

  return (
    <main className="app stack">
      <section className="hero">
        <span className="pill ok">No automatic AI calls</span>
        <h1>Options</h1>
        <p className="muted">Profile, resume, AI settings, saved searches, and privacy controls.</p>
      </section>

      <section className="grid two">
        <section className="card stack">
          <h2>User Profile Editor</h2>
          <input
            value={profile?.contact.fullName ?? ''}
            readOnly
            placeholder="Parsed full name appears here"
          />
          <input
            value={profile?.contact.email ?? ''}
            readOnly
            placeholder="Parsed email appears here"
          />
          <textarea
            value={profile?.skills.join(', ') ?? ''}
            readOnly
            placeholder="Parsed skills appear here"
          />
        </section>

        <section className="card stack">
          <h2>Resume Import Or Paste</h2>
          <textarea
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            placeholder="Paste fake or personal resume text here. Real data stays in browser storage."
          />
          <button onClick={parseAndSaveProfile}>Parse And Save Locally</button>
          <p className="muted">
            `.docx` parsing support exists in code and will be wired into this UI after more browser
            testing.
          </p>
        </section>

        <section className="card stack">
          <h2>AI Provider Settings</h2>
          <label>
            <input
              type="checkbox"
              checked={settings.localOnlyMode}
              onChange={(event) =>
                saveSettings({ ...settings, localOnlyMode: event.target.checked, aiEnabled: false })
              }
            />
            Local-only mode
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.aiEnabled}
              disabled={settings.localOnlyMode}
              onChange={(event) => saveSettings({ ...settings, aiEnabled: event.target.checked })}
            />
            Enable AI provider after review
          </label>
          <select
            value={settings.aiProvider}
            onChange={(event) =>
              saveSettings({
                ...settings,
                aiProvider: event.target.value as ExtensionSettings['aiProvider']
              })
            }
          >
            <option value="manual">Manual local rules</option>
            <option value="openai-compatible">OpenAI-compatible</option>
            <option value="ollama">Ollama</option>
          </select>
          <p className="muted">
            API keys are not stored in source. AI requests must be reviewed before sending.
          </p>
        </section>

        <section className="card stack">
          <h2>Saved Searches</h2>
          <input placeholder="Search label" />
          <input placeholder="Search URL" />
          <button className="secondary">Save Search URL</button>
          <button className="secondary">Check Now</button>
          <p className="muted">Batch 1 keeps checks conservative and user-triggered.</p>
        </section>

        <section className="card stack">
          <h2>Privacy Controls</h2>
          <button className="danger" onClick={clearLocalData}>
            Clear Local Data
          </button>
          <button className="secondary">Export Placeholder</button>
          <button className="secondary">Import Placeholder</button>
          <p className="muted">
            Real resumes and profile data stay local unless the user explicitly approves an AI
            request.
          </p>
        </section>

        <section className="card stack">
          <h2>Docs</h2>
          <a href="../docs/privacy-model.md">Privacy model</a>
          <a href="../docs/captcha-and-bot-check-boundaries.md">CAPTCHA boundaries</a>
          <a href="../docs/local-development.md">Local development</a>
        </section>
      </section>

      <section className="card">
        <p>{status}</p>
      </section>
    </main>
  );
}
