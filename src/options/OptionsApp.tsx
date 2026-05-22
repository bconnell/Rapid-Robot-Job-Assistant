import { useEffect, useState } from 'react';
import {
  ChromeStorageRepository,
  defaultSettings,
  type ExtensionSettings
} from '../shared/storage/ChromeStorageRepository';
import { clearAllIndexedDbData } from '../shared/storage/IndexedDbRepository';
import {
  ApplicationSessionRepository,
  JobPostingRepository,
  ProfileRepository,
  ResumeDocumentRepository,
  SavedSearchRepository
} from '../shared/storage/TypedRepositories';
import { extractTextFromDocx } from '../shared/parsing/DocxResumeParser';
import { extractPlainTextFromPaste } from '../shared/parsing/ResumeTextExtractor';
import { parseResumeSections } from '../shared/parsing/ResumeSectionParser';
import { createSavedSearch, markSavedSearchChecked } from '../shared/jobs/SavedSearchService';
import { createLocalDataExport, validateLocalDataImport } from '../shared/data/LocalDataTransfer';
import {
  emptyUserProfile,
  type ProfileEducation,
  type ProfileExperience,
  type UserProfile
} from '../shared/models/UserProfile';
import type { SavedSearch } from '../shared/models/SavedSearch';
import type { ResumeDocument } from '../shared/models/ResumeDocument';

const settingsRepo = new ChromeStorageRepository();
const profileRepo = new ProfileRepository();
const resumeRepo = new ResumeDocumentRepository();
const searchRepo = new SavedSearchRepository();
const jobRepo = new JobPostingRepository();
const sessionRepo = new ApplicationSessionRepository();

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [resumeText, setResumeText] = useState('');
  const [profile, setProfile] = useState<UserProfile>(emptyUserProfile());
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchForm, setSearchForm] = useState({
    label: '',
    url: '',
    keywords: '',
    location: '',
    remoteOnly: false
  });
  const [status, setStatus] = useState('Local-only mode is on by default.');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState('');

  useEffect(() => {
    void loadOptions();
  }, []);

  async function loadOptions() {
    const [nextSettings, nextProfileId, searches] = await Promise.all([
      settingsRepo.getSettings(),
      settingsRepo.getActiveProfileId(),
      searchRepo.list()
    ]);
    setSettings(nextSettings);
    setActiveProfileId(nextProfileId);
    setSavedSearches(searches);
    if (nextProfileId) {
      const active = await profileRepo.get(nextProfileId);
      if (active) setProfile(active);
    }
  }

  async function saveSettings(next: ExtensionSettings) {
    setSettings(next);
    await settingsRepo.saveSettings(next);
    setStatus('Settings saved locally.');
  }

  async function parseAndSaveProfileFromText(
    sourceType: ResumeDocument['sourceType'],
    fileName?: string
  ) {
    const extracted = extractPlainTextFromPaste(resumeText);
    if (!extracted.ok) {
      setStatus(extracted.error);
      return;
    }
    await saveParsedResume(extracted.value, sourceType, fileName);
  }

  async function importDocx(file?: File) {
    if (!file) return;
    setStatus(`Reading ${file.name} locally.`);
    const extracted = await extractTextFromDocx(file);
    if (!extracted.ok) {
      setStatus(extracted.error);
      return;
    }
    setResumeText(extracted.value);
    await saveParsedResume(extracted.value, 'docx', file.name);
  }

  async function saveParsedResume(
    text: string,
    sourceType: ResumeDocument['sourceType'],
    fileName?: string
  ) {
    const parsed = parseResumeSections(text);
    const nextProfile = {
      ...parsed.profile,
      id: profile.id || parsed.profile.id,
      updatedAt: new Date().toISOString()
    };
    const resumeDocument: ResumeDocument = {
      id: crypto.randomUUID(),
      fileName,
      sourceType,
      text,
      importedAt: new Date().toISOString(),
      warnings: parsed.warnings
    };
    setProfile(nextProfile);
    setWarnings(parsed.warnings.map((warning) => warning.message));
    await Promise.all([profileRepo.save(nextProfile), resumeRepo.save(resumeDocument)]);
    await settingsRepo.setActiveProfileId(nextProfile.id);
    setActiveProfileId(nextProfile.id);
    setStatus(
      fileName
        ? `${fileName} imported and profile saved locally.`
        : 'Resume parsed and profile saved locally.'
    );
  }

  async function saveProfile() {
    const next = { ...profile, updatedAt: new Date().toISOString() };
    await profileRepo.save(next);
    await settingsRepo.setActiveProfileId(next.id);
    setProfile(next);
    setActiveProfileId(next.id);
    setStatus('Profile saved locally.');
  }

  async function createSearch() {
    try {
      const search = createSavedSearch({
        label: searchForm.label,
        url: searchForm.url,
        keywords: searchForm.keywords.split(','),
        location: searchForm.location,
        remoteOnly: searchForm.remoteOnly
      });
      await searchRepo.save(search);
      setSavedSearches(await searchRepo.list());
      setSearchForm({ label: '', url: '', keywords: '', location: '', remoteOnly: false });
      setStatus('Saved search stored locally.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Saved search could not be created.');
    }
  }

  async function checkSearch(search: SavedSearch) {
    const updated = markSavedSearchChecked(
      search,
      'Manual check saved. Open the search URL and analyze visible results when ready.'
    );
    await searchRepo.save(updated);
    setSavedSearches(await searchRepo.list());
    setStatus('Manual saved-search check recorded. No background crawling was run.');
  }

  async function deleteSearch(id: string) {
    await searchRepo.delete(id);
    setSavedSearches(await searchRepo.list());
    setStatus('Saved search deleted locally.');
  }

  async function exportLocalData() {
    const confirmed = window.confirm(
      'Exported JSON may contain private profile, resume-derived, job, and application data. Keep it out of git and shared folders.'
    );
    if (!confirmed) return;
    const data = createLocalDataExport({
      profiles: await profileRepo.list(),
      savedSearches: await searchRepo.list(),
      jobPostings: await jobRepo.list(),
      applicationSessions: await sessionRepo.list(),
      settings
    });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rapid-robot-job-assistant-export.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Local data export created. Do not commit exported files.');
  }

  async function previewImport(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const preview = validateLocalDataImport(parsed);
      setImportPreview(
        preview.valid
          ? `Valid import: ${preview.counts.profiles} profiles, ${preview.counts.savedSearches} searches, ${preview.counts.jobPostings} jobs, ${preview.counts.applicationSessions} sessions.`
          : preview.errors.join(' ')
      );
      setStatus(
        preview.valid
          ? 'Import preview validated. Merge import is still manual in Batch 2.'
          : 'Import file did not validate.'
      );
    } catch {
      setImportPreview('Invalid JSON file.');
      setStatus('Import file did not validate.');
    }
  }

  async function clearLocalData() {
    const confirmed = window.confirm(
      'Clear local extension settings, profiles, saved jobs, searches, and sessions?'
    );
    if (!confirmed) return;
    await settingsRepo.clearSettings();
    await clearAllIndexedDbData();
    setSettings(defaultSettings);
    setProfile(emptyUserProfile());
    setActiveProfileId(undefined);
    setSavedSearches([]);
    setResumeText('');
    setWarnings([]);
    setStatus('Local extension data cleared.');
  }

  return (
    <main className="app stack">
      <section className="hero">
        <span className="pill ok">Local-only by default</span>
        <h1>Options</h1>
        <p className="muted">
          Import a resume, review the profile, save searches, and manage local data.
        </p>
      </section>

      <section className="grid two">
        <section className="card stack">
          <h2>Resume Import</h2>
          <p className="muted">
            Pasted text and `.docx` files are parsed locally. The original file blob is not stored.
          </p>
          <textarea
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            placeholder="Paste fake or personal resume text here. Real data stays in browser storage."
          />
          <div className="row">
            <button onClick={() => parseAndSaveProfileFromText('pasted-text')}>
              Parse Pasted Text
            </button>
            <label className="file-picker">
              Import .docx
              <input
                type="file"
                accept=".docx"
                onChange={(event) => importDocx(event.target.files?.[0])}
              />
            </label>
          </div>
          {warnings.map((warning) => (
            <p key={warning} className="warn">
              {warning}
            </p>
          ))}
        </section>

        <section className="card stack">
          <h2>Profile Review</h2>
          <p className={activeProfileId ? 'ok' : 'warn'}>
            {activeProfileId ? 'Active profile loaded.' : 'No active profile yet.'}
          </p>
          <div className="grid two">
            <TextInput
              label="Full name"
              value={profile.contact.fullName ?? ''}
              onChange={(value) => updateContact({ fullName: value })}
            />
            <TextInput
              label="Preferred name"
              value={profile.contact.preferredName ?? ''}
              onChange={(value) => updateContact({ preferredName: value })}
            />
            <TextInput
              label="Email"
              value={profile.contact.email ?? ''}
              onChange={(value) => updateContact({ email: value })}
            />
            <TextInput
              label="Phone"
              value={profile.contact.phone ?? ''}
              onChange={(value) => updateContact({ phone: value })}
            />
            <TextInput
              label="City"
              value={profile.contact.city ?? ''}
              onChange={(value) => updateContact({ city: value })}
            />
            <TextInput
              label="State"
              value={profile.contact.state ?? ''}
              onChange={(value) => updateContact({ state: value })}
            />
            <TextInput
              label="Zip"
              value={profile.contact.zip ?? ''}
              onChange={(value) => updateContact({ zip: value })}
            />
            <TextInput
              label="LinkedIn"
              value={profile.contact.linkedInUrl ?? ''}
              onChange={(value) => updateContact({ linkedInUrl: value })}
            />
            <TextInput
              label="GitHub"
              value={profile.contact.githubUrl ?? ''}
              onChange={(value) => updateContact({ githubUrl: value })}
            />
            <TextInput
              label="Portfolio"
              value={profile.contact.portfolioUrl ?? ''}
              onChange={(value) => updateContact({ portfolioUrl: value })}
            />
          </div>
          <label>
            Summary
            <textarea
              value={profile.summary ?? ''}
              onChange={(event) => setProfile({ ...profile, summary: event.target.value })}
            />
          </label>
          <TextInput
            label="Skills, comma separated"
            value={profile.skills.join(', ')}
            onChange={(value) => setProfile({ ...profile, skills: splitComma(value) })}
          />
          <TextInput
            label="Desired titles, comma separated"
            value={profile.desiredTitles.join(', ')}
            onChange={(value) => setProfile({ ...profile, desiredTitles: splitComma(value) })}
          />
          <div className="grid two">
            <TextInput
              label="Work authorization"
              value={profile.workAuthorization ?? ''}
              onChange={(value) => setProfile({ ...profile, workAuthorization: value })}
            />
            <TextInput
              label="Desired salary"
              value={profile.desiredSalary ?? ''}
              onChange={(value) => setProfile({ ...profile, desiredSalary: value })}
            />
            <TextInput
              label="Earliest start date"
              value={profile.earliestStartDate ?? ''}
              onChange={(value) => setProfile({ ...profile, earliestStartDate: value })}
            />
            <label>
              Sponsorship required
              <select
                value={
                  profile.sponsorshipRequired === undefined
                    ? ''
                    : profile.sponsorshipRequired
                      ? 'yes'
                      : 'no'
                }
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    sponsorshipRequired:
                      event.target.value === '' ? undefined : event.target.value === 'yes'
                  })
                }
              >
                <option value="">Not set</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </div>
          <EditableExperience
            items={profile.experience}
            onChange={(experience) => setProfile({ ...profile, experience })}
          />
          <EditableEducation
            items={profile.education}
            onChange={(education) => setProfile({ ...profile, education })}
          />
          <TextInput
            label="Certifications, comma separated"
            value={profile.certifications.join(', ')}
            onChange={(value) => setProfile({ ...profile, certifications: splitComma(value) })}
          />
          <button onClick={saveProfile}>Save Profile Locally</button>
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
            />{' '}
            Local-only mode
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.aiEnabled}
              disabled={settings.localOnlyMode}
              onChange={(event) => saveSettings({ ...settings, aiEnabled: event.target.checked })}
            />{' '}
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
          <p className="muted">AI remains disabled by default. API keys are not exported.</p>
        </section>

        <section className="card stack">
          <h2>Saved Searches</h2>
          <TextInput
            label="Name"
            value={searchForm.label}
            onChange={(value) => setSearchForm({ ...searchForm, label: value })}
          />
          <TextInput
            label="Search URL"
            value={searchForm.url}
            onChange={(value) => setSearchForm({ ...searchForm, url: value })}
          />
          <TextInput
            label="Keywords"
            value={searchForm.keywords}
            onChange={(value) => setSearchForm({ ...searchForm, keywords: value })}
          />
          <TextInput
            label="Location"
            value={searchForm.location}
            onChange={(value) => setSearchForm({ ...searchForm, location: value })}
          />
          <label>
            <input
              type="checkbox"
              checked={searchForm.remoteOnly}
              onChange={(event) =>
                setSearchForm({ ...searchForm, remoteOnly: event.target.checked })
              }
            />{' '}
            Remote only
          </label>
          <button className="secondary" onClick={createSearch}>
            Save Search URL
          </button>
          {savedSearches.map((search) => (
            <div className="mini-card" key={search.id}>
              <strong>{search.label}</strong>
              <p className="muted">{search.url}</p>
              <p className="muted">{search.lastCheckStatus ?? 'Not checked yet.'}</p>
              <div className="row">
                <button className="secondary" onClick={() => checkSearch(search)}>
                  Check Now
                </button>
                <button className="danger" onClick={() => deleteSearch(search.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="card stack">
          <h2>Privacy Controls</h2>
          <button className="secondary" onClick={exportLocalData}>
            Export Local Data
          </button>
          <label className="file-picker secondary">
            Preview Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => previewImport(event.target.files?.[0])}
            />
          </label>
          {importPreview && <p className="muted">{importPreview}</p>}
          <button className="danger" onClick={clearLocalData}>
            Clear Local Data
          </button>
          <p className="muted">
            Exports may contain private data. Import is preview-only in Batch 2.
          </p>
        </section>

        <section className="card stack">
          <h2>Docs</h2>
          <a href="../docs/application-workflow.md">Application workflow</a>
          <a href="../docs/privacy-model.md">Privacy model</a>
          <a href="../docs/local-development.md">Local development</a>
        </section>
      </section>

      <section className="card">
        <p>{status}</p>
      </section>
    </main>
  );

  function updateContact(next: Partial<UserProfile['contact']>) {
    setProfile({ ...profile, contact: { ...profile.contact, ...next } });
  }
}

function TextInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function EditableExperience({
  items,
  onChange
}: {
  items: ProfileExperience[];
  onChange: (items: ProfileExperience[]) => void;
}) {
  return (
    <section className="stack">
      <h3>Experience</h3>
      {items.map((item, index) => (
        <div className="mini-card stack" key={index}>
          <TextInput
            label="Title"
            value={item.title}
            onChange={(value) => update(index, { ...item, title: value })}
          />
          <TextInput
            label="Employer"
            value={item.employer}
            onChange={(value) => update(index, { ...item, employer: value })}
          />
          <textarea
            value={item.highlights.join('\n')}
            onChange={(event) =>
              update(index, { ...item, highlights: event.target.value.split('\n').filter(Boolean) })
            }
          />
          <button
            className="danger"
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remove Experience
          </button>
        </div>
      ))}
      <button
        className="secondary"
        onClick={() => onChange([...items, { title: '', employer: '', highlights: [] }])}
      >
        Add Experience
      </button>
    </section>
  );

  function update(index: number, item: ProfileExperience) {
    onChange(items.map((candidate, itemIndex) => (itemIndex === index ? item : candidate)));
  }
}

function EditableEducation({
  items,
  onChange
}: {
  items: ProfileEducation[];
  onChange: (items: ProfileEducation[]) => void;
}) {
  return (
    <section className="stack">
      <h3>Education</h3>
      {items.map((item, index) => (
        <div className="mini-card stack" key={index}>
          <TextInput
            label="School"
            value={item.school}
            onChange={(value) => update(index, { ...item, school: value })}
          />
          <TextInput
            label="Degree"
            value={item.degree ?? ''}
            onChange={(value) => update(index, { ...item, degree: value })}
          />
          <button
            className="danger"
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remove Education
          </button>
        </div>
      ))}
      <button className="secondary" onClick={() => onChange([...items, { school: '' }])}>
        Add Education
      </button>
    </section>
  );

  function update(index: number, item: ProfileEducation) {
    onChange(items.map((candidate, itemIndex) => (itemIndex === index ? item : candidate)));
  }
}

function splitComma(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
