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
import {
  parseResumeSections,
  type ResumeParseSummary
} from '../shared/parsing/ResumeSectionParser';
import { createSavedSearch, markSavedSearchChecked } from '../shared/jobs/SavedSearchService';
import { createLocalDataExport, validateLocalDataImport } from '../shared/data/LocalDataTransfer';
import { clearTargetTab } from '../shared/extension/TargetPageTracker';
import {
  browserLabel,
  detectBrowserCompatibility,
  type BrowserCompatibility
} from '../shared/extension/BrowserCompatibility';
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
  const [parseSummary, setParseSummary] = useState<ResumeParseSummary | undefined>();
  const [importPreview, setImportPreview] = useState('');
  const [browser, setBrowser] = useState<BrowserCompatibility>();

  useEffect(() => {
    void loadOptions();
    void detectBrowserCompatibility().then(setBrowser);
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
    setParseSummary(parsed.summary);
    setWarnings(parsed.summary.needsReview);
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
          ? 'Import preview validated. Merge import still needs a separate review step.'
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
    setParseSummary(undefined);
    setStatus('Local extension data cleared.');
  }

  async function clearTargetPage() {
    await clearTargetTab();
    setStatus('Saved target page cleared.');
  }

  async function clearSavedSearches() {
    if (!window.confirm('Delete all saved searches from local extension storage?')) return;
    await Promise.all((await searchRepo.list()).map((search) => searchRepo.delete(search.id)));
    setSavedSearches([]);
    setStatus('Saved searches cleared locally.');
  }

  async function clearSavedJobsAndSessions() {
    if (!window.confirm('Delete saved jobs and application sessions from local extension storage?'))
      return;
    await Promise.all([
      ...(await jobRepo.list()).map((job) => jobRepo.delete(job.id)),
      ...(await sessionRepo.list()).map((session) => sessionRepo.delete(session.id))
    ]);
    setStatus('Saved jobs and application sessions cleared locally.');
  }

  async function clearSavedProfiles() {
    if (
      !window.confirm(
        'Delete saved profiles and resume-derived records from local extension storage?'
      )
    )
      return;
    await Promise.all([
      ...(await profileRepo.list()).map((savedProfile) => profileRepo.delete(savedProfile.id)),
      ...(await resumeRepo.list()).map((resume) => resumeRepo.delete(resume.id))
    ]);
    await settingsRepo.clearSettings();
    setProfile(emptyUserProfile());
    setActiveProfileId(undefined);
    setResumeText('');
    setWarnings([]);
    setParseSummary(undefined);
    setStatus('Saved profiles and resume-derived records cleared locally.');
  }

  return (
    <main className="app options-page">
      <StatusBanner status={status} />
      <section className="options-layout">
        <div className="options-main stack">
          <ResumeImportPanel
            resumeText={resumeText}
            warnings={warnings}
            parseSummary={parseSummary}
            onResumeTextChange={setResumeText}
            onParseText={() => parseAndSaveProfileFromText('pasted-text')}
            onImportDocx={importDocx}
          />
          <ProfileReviewPanel
            profile={profile}
            activeProfileId={activeProfileId}
            parseSummary={parseSummary}
            onProfileChange={setProfile}
            onSaveProfile={saveProfile}
          />
        </div>
        <aside className="options-sidebar stack">
          <AiProviderSettingsPanel settings={settings} onSaveSettings={saveSettings} />
          <SavedSearchesPanel
            searchForm={searchForm}
            savedSearches={savedSearches}
            onSearchFormChange={setSearchForm}
            onCreateSearch={createSearch}
            onCheckSearch={checkSearch}
            onDeleteSearch={deleteSearch}
          />
          <PrivacyControlsPanel
            importPreview={importPreview}
            onExport={exportLocalData}
            onPreviewImport={previewImport}
            onClearTargetPage={clearTargetPage}
            onClearSavedSearches={clearSavedSearches}
            onClearSavedJobsAndSessions={clearSavedJobsAndSessions}
            onClearSavedProfiles={clearSavedProfiles}
            onClearLocalData={clearLocalData}
          />
          <BrowserDiagnosticsPanel browser={browser} />
          <DocsPanel />
        </aside>
      </section>
    </main>
  );
}

function BrowserDiagnosticsPanel({ browser }: { browser?: BrowserCompatibility }) {
  return (
    <section className="card stack options-card compact-card">
      <h2>Browser Diagnostics</h2>
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
  );
}

function StatusBanner({ status }: { status: string }) {
  return (
    <section className="hero options-hero">
      <span className="pill ok">Local-only by default</span>
      <h1>Options</h1>
      <p className="muted">
        Import a resume, review the profile, save searches, and manage local data.
      </p>
      <p className="options-status">{status}</p>
    </section>
  );
}

function ResumeImportPanel({
  resumeText,
  warnings,
  parseSummary,
  onResumeTextChange,
  onParseText,
  onImportDocx
}: {
  resumeText: string;
  warnings: string[];
  parseSummary?: ResumeParseSummary;
  onResumeTextChange: (value: string) => void;
  onParseText: () => void;
  onImportDocx: (file?: File) => void;
}) {
  return (
    <section className="card stack options-card">
      <h2>Resume Import</h2>
      <p className="muted">
        Pasted text and `.docx` files are parsed locally. The original file blob is not stored.
      </p>
      <textarea
        className="resume-source"
        value={resumeText}
        onChange={(event) => onResumeTextChange(event.target.value)}
        placeholder="Paste fake or personal resume text here. Real data stays in browser storage."
      />
      <div className="row">
        <button onClick={onParseText}>Parse Pasted Text</button>
        <label className="file-picker">
          Import .docx
          <input
            type="file"
            accept=".docx"
            onChange={(event) => onImportDocx(event.target.files?.[0])}
          />
        </label>
      </div>
      {parseSummary ? (
        <ParseSummaryCard summary={parseSummary} warnings={warnings} />
      ) : (
        <p className="empty-state">No resume parsed yet.</p>
      )}
    </section>
  );
}

function ParseSummaryCard({
  summary,
  warnings
}: {
  summary: ResumeParseSummary;
  warnings: string[];
}) {
  return (
    <div className="parse-summary">
      <span>Contact: {summary.contactFound ? 'found' : 'review'}</span>
      <span>Summary: {summary.summaryFound ? 'found' : 'not found'}</span>
      <span>Skills: {summary.skillsCount}</span>
      <span>Experience: {summary.experienceCount}</span>
      <span>Education: {summary.educationCount}</span>
      <span>Certifications: {summary.certificationsCount}</span>
      {warnings.length > 0 && (
        <div className="warning-list">
          <strong>Needs review</strong>
          {warnings.map((warning) => (
            <p key={warning} className="warn">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileReviewPanel({
  profile,
  activeProfileId,
  parseSummary,
  onProfileChange,
  onSaveProfile
}: {
  profile: UserProfile;
  activeProfileId?: string;
  parseSummary?: ResumeParseSummary;
  onProfileChange: (profile: UserProfile) => void;
  onSaveProfile: () => void;
}) {
  function updateContact(next: Partial<UserProfile['contact']>) {
    onProfileChange({ ...profile, contact: { ...profile.contact, ...next } });
  }

  return (
    <section className="card stack options-card">
      <h2>Profile Review</h2>
      <p className={activeProfileId ? 'ok' : 'warn'}>
        {activeProfileId ? 'Active profile loaded.' : 'No active profile yet.'}
      </p>
      <div className="profile-grid">
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
          className="profile-summary"
          value={profile.summary ?? ''}
          onChange={(event) => onProfileChange({ ...profile, summary: event.target.value })}
        />
      </label>
      <TextInput
        label="Skills, comma separated"
        value={profile.skills.join(', ')}
        onChange={(value) => onProfileChange({ ...profile, skills: splitComma(value) })}
      />
      <TextInput
        label="Desired titles, comma separated"
        value={profile.desiredTitles.join(', ')}
        onChange={(value) => onProfileChange({ ...profile, desiredTitles: splitComma(value) })}
      />
      <div className="profile-grid">
        <TextInput
          label="Work authorization"
          value={profile.workAuthorization ?? ''}
          onChange={(value) => onProfileChange({ ...profile, workAuthorization: value })}
        />
        <TextInput
          label="Desired salary"
          value={profile.desiredSalary ?? ''}
          onChange={(value) => onProfileChange({ ...profile, desiredSalary: value })}
        />
        <TextInput
          label="Earliest start date"
          value={profile.earliestStartDate ?? ''}
          onChange={(value) => onProfileChange({ ...profile, earliestStartDate: value })}
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
              onProfileChange({
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
        parseSummary={parseSummary}
        onChange={(experience) => onProfileChange({ ...profile, experience })}
      />
      <EditableEducation
        items={profile.education}
        onChange={(education) => onProfileChange({ ...profile, education })}
      />
      <TextInput
        label="Certifications, comma separated"
        value={profile.certifications.join(', ')}
        onChange={(value) => onProfileChange({ ...profile, certifications: splitComma(value) })}
      />
      <button onClick={onSaveProfile}>Save Profile Locally</button>
    </section>
  );
}

function AiProviderSettingsPanel({
  settings,
  onSaveSettings
}: {
  settings: ExtensionSettings;
  onSaveSettings: (settings: ExtensionSettings) => void;
}) {
  return (
    <section className="card stack options-card compact-card">
      <h2>AI Provider Settings</h2>
      <label>
        <input
          type="checkbox"
          checked={settings.localOnlyMode}
          onChange={(event) =>
            onSaveSettings({ ...settings, localOnlyMode: event.target.checked, aiEnabled: false })
          }
        />{' '}
        Local-only mode
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.aiEnabled}
          disabled={settings.localOnlyMode}
          onChange={(event) => onSaveSettings({ ...settings, aiEnabled: event.target.checked })}
        />{' '}
        Enable AI provider after review
      </label>
      <select
        value={settings.aiProvider}
        onChange={(event) =>
          onSaveSettings({
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
  );
}

function SavedSearchesPanel({
  searchForm,
  savedSearches,
  onSearchFormChange,
  onCreateSearch,
  onCheckSearch,
  onDeleteSearch
}: {
  searchForm: {
    label: string;
    url: string;
    keywords: string;
    location: string;
    remoteOnly: boolean;
  };
  savedSearches: SavedSearch[];
  onSearchFormChange: (form: {
    label: string;
    url: string;
    keywords: string;
    location: string;
    remoteOnly: boolean;
  }) => void;
  onCreateSearch: () => void;
  onCheckSearch: (search: SavedSearch) => void;
  onDeleteSearch: (id: string) => void;
}) {
  return (
    <section className="card stack options-card compact-card">
      <h2>Saved Searches</h2>
      <TextInput
        label="Name"
        value={searchForm.label}
        onChange={(value) => onSearchFormChange({ ...searchForm, label: value })}
      />
      <TextInput
        label="Search URL"
        value={searchForm.url}
        onChange={(value) => onSearchFormChange({ ...searchForm, url: value })}
      />
      <TextInput
        label="Keywords"
        value={searchForm.keywords}
        onChange={(value) => onSearchFormChange({ ...searchForm, keywords: value })}
      />
      <TextInput
        label="Location"
        value={searchForm.location}
        onChange={(value) => onSearchFormChange({ ...searchForm, location: value })}
      />
      <label>
        <input
          type="checkbox"
          checked={searchForm.remoteOnly}
          onChange={(event) =>
            onSearchFormChange({ ...searchForm, remoteOnly: event.target.checked })
          }
        />{' '}
        Remote only
      </label>
      <button className="secondary" onClick={onCreateSearch}>
        Save Search URL
      </button>
      {savedSearches.length === 0 && <p className="empty-state">No saved searches yet.</p>}
      {savedSearches.map((search) => (
        <div className="mini-card" key={search.id}>
          <strong>{search.label}</strong>
          <p className="muted">{search.url}</p>
          <p className="muted">{search.lastCheckStatus ?? 'Not checked yet.'}</p>
          <div className="row">
            <button className="secondary" onClick={() => onCheckSearch(search)}>
              Check Now
            </button>
            <button className="danger" onClick={() => onDeleteSearch(search.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function PrivacyControlsPanel({
  importPreview,
  onExport,
  onPreviewImport,
  onClearTargetPage,
  onClearSavedSearches,
  onClearSavedJobsAndSessions,
  onClearSavedProfiles,
  onClearLocalData
}: {
  importPreview: string;
  onExport: () => void;
  onPreviewImport: (file?: File) => void;
  onClearTargetPage: () => void;
  onClearSavedSearches: () => void;
  onClearSavedJobsAndSessions: () => void;
  onClearSavedProfiles: () => void;
  onClearLocalData: () => void;
}) {
  return (
    <section className="card stack options-card compact-card">
      <h2>Privacy Controls</h2>
      <p className="muted">
        Saved profiles, jobs, application sessions, notes, saved searches, and settings stay local
        until you delete them, clear extension data, or uninstall the extension.
      </p>
      <button className="secondary" onClick={onExport}>
        Export Local Data
      </button>
      <label className="file-picker secondary">
        Preview Import JSON
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => onPreviewImport(event.target.files?.[0])}
        />
      </label>
      {importPreview && <p className="muted">{importPreview}</p>}
      <div className="stack mini-card">
        <h3>Local Data Cleanup</h3>
        <button className="secondary" onClick={onClearTargetPage}>
          Clear Target Page
        </button>
        <button className="secondary" onClick={onClearSavedSearches}>
          Clear Saved Searches
        </button>
        <button className="secondary" onClick={onClearSavedJobsAndSessions}>
          Clear Saved Jobs and Sessions
        </button>
        <button className="secondary" onClick={onClearSavedProfiles}>
          Clear Saved Profiles
        </button>
      </div>
      <button className="danger danger-inline" onClick={onClearLocalData}>
        Clear Local Data
      </button>
      <p className="muted">
        Exports may contain private data. Original `.docx` file blobs and raw real page HTML are not
        stored.
      </p>
    </section>
  );
}

function DocsPanel() {
  const docs = [
    [
      'Application workflow',
      '../docs/application-workflow.md',
      'Profile import through reviewed field fill.'
    ],
    ['Privacy model', '../docs/privacy-model.md', 'What stays local and what export contains.'],
    [
      'Browser compatibility',
      '../docs/browser-compatibility.md',
      'Chrome, Brave, Edge, and Chromium notes.'
    ],
    ['Local development', '../docs/local-development.md', 'Build, test, and load the extension.']
  ];
  return (
    <section className="card stack options-card compact-card docs-card">
      <h2>Docs</h2>
      {docs.map(([label, href, description]) => (
        <a className="doc-link" href={href} key={href}>
          <strong>{label}</strong>
          <span>{description}</span>
        </a>
      ))}
    </section>
  );
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
  parseSummary,
  onChange
}: {
  items: ProfileExperience[];
  parseSummary?: ResumeParseSummary;
  onChange: (items: ProfileExperience[]) => void;
}) {
  const needsReview =
    parseSummary?.experienceSource === 'inferred-fallback' ||
    items.some((item) => item.title === 'Needs review' || item.employer === 'Needs review');
  const reviewCount =
    parseSummary?.experienceSource === 'inferred-fallback'
      ? Math.max(1, parseSummary.experienceNeedsReviewCount)
      : (parseSummary?.experienceNeedsReviewCount ?? 0);
  return (
    <section className="stack nested-editor">
      <h3>Experience</h3>
      <p className="muted">Review parsed experience before using it to fill applications.</p>
      {items.length > 0 && (
        <p className={needsReview ? 'warn' : 'muted'}>
          Experience source:{' '}
          {parseSummary?.experienceSource === 'inferred-fallback'
            ? 'inferred fallback'
            : 'parsed section'}
          {needsReview ? ` | Entries needing review: ${reviewCount}` : ''}
        </p>
      )}
      {items.length === 0 && <p className="empty-state">No experience entries parsed yet.</p>}
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
            className="danger danger-inline"
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
    <section className="stack nested-editor">
      <h3>Education</h3>
      {items.length === 0 && <p className="empty-state">No education entries parsed yet.</p>}
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
          <TextInput
            label="Field"
            value={item.field ?? ''}
            onChange={(value) => update(index, { ...item, field: value })}
          />
          <TextInput
            label="Graduation date"
            value={item.graduationDate ?? ''}
            onChange={(value) => update(index, { ...item, graduationDate: value })}
          />
          <button
            className="danger danger-inline"
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
