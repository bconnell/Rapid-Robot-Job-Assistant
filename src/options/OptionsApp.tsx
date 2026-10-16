import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChromeStorageRepository,
  defaultSettings,
  type ExtensionSettings
} from '../shared/storage/ChromeStorageRepository';
import {
  clearAllIndexedDbData,
  clearIndexedDbStores,
  readLocalDataSnapshot,
  saveProfileWithResume
} from '../shared/storage/IndexedDbRepository';
import {
  ApplicationSessionRepository,
  JobPostingRepository,
  ProfileRepository,
  SavedSearchRepository
} from '../shared/storage/TypedRepositories';
import { extractTextFromDocx } from '../shared/parsing/DocxResumeParser';
import { extractPlainTextFromPaste } from '../shared/parsing/ResumeTextExtractor';
import {
  parseResumeSections,
  type ResumeParseSummary
} from '../shared/parsing/ResumeSectionParser';
import { createSavedSearch, markSavedSearchChecked, normalizeSavedSearchUrl } from '../shared/jobs/SavedSearchService';
import {
  createLocalDataExport,
  isValidApplicationSessionRecord,
  isValidJobPostingRecord,
  isValidResumeDocumentRecord,
  isValidStoredFieldMappingRecord,
  isValidTailoringSuggestionRecord,
  isValidSavedSearchRecord,
  isValidUserProfileRecord,
  validateLocalDataImport,
  type LocalDataExport,
  type ImportPreview
} from '../shared/data/LocalDataTransfer';
import { importLocalDataAdditively } from '../shared/data/LocalDataImportService';
import {
  filterSavedJobs,
  filterSavedSessions,
  orderSavedJobs,
  orderSavedSessions
} from '../shared/jobs/JobHistoryOrdering';
import { normalizePageUrl } from '../shared/extension/PageCommandIntegrity';
import type { JobPosting } from '../shared/models/JobPosting';
import type { ApplicationSession } from '../shared/models/ApplicationSession';
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
const searchRepo = new SavedSearchRepository();
const jobRepo = new JobPostingRepository();
const sessionRepo = new ApplicationSessionRepository();
const maxImportBytes = 5 * 1024 * 1024;

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [resumeText, setResumeText] = useState('');
  const [profile, setProfile] = useState<UserProfile>(emptyUserProfile());
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>();
  const [savedProfiles, setSavedProfiles] = useState<UserProfile[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedJobs, setSavedJobs] = useState<JobPosting[]>([]);
  const [savedSessions, setSavedSessions] = useState<ApplicationSession[]>([]);
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
  const [validatedImport, setValidatedImport] = useState<LocalDataExport>();
  const [importPending, setImportPending] = useState(false);
  const importGeneration = useRef(0);
  const [browser, setBrowser] = useState<BrowserCompatibility>();

  useEffect(() => {
    void loadOptions().catch(() => {
      setStatus('Could not load local data. Reopen Options to retry.');
    });
    void detectBrowserCompatibility().then(setBrowser);
  }, []);

  async function loadOptions() {
    const [nextSettings, nextProfileId, searches, profiles, jobs, sessions] = await Promise.all([
      settingsRepo.getSettings(),
      settingsRepo.getActiveProfileId(),
      searchRepo.list(),
      profileRepo.list(),
      jobRepo.list(),
      sessionRepo.list()
    ]);
    const validSearches = searches.filter(isValidSavedSearchRecord);
    const validProfiles = profiles.filter(isValidUserProfileRecord);
    const validJobs = jobs.filter(isValidJobPostingRecord);
    const validSessions = sessions.filter(isValidApplicationSessionRecord);
    setSavedJobs(orderSavedJobs(validJobs));
    setSavedSessions(orderSavedSessions(validSessions));
    setSettings(nextSettings);
    setActiveProfileId(nextProfileId);
    setSavedSearches(validSearches);
    setSavedProfiles(validProfiles);
    if (
      searches.length !== validSearches.length ||
      profiles.length !== validProfiles.length ||
      jobs.length !== validJobs.length ||
      sessions.length !== validSessions.length
    ) {
      setStatus('Invalid saved records were hidden from the options page.');
    }
    if (nextProfileId) {
      const active = await profileRepo.get(nextProfileId);
      if (active && isValidUserProfileRecord(active)) {
        setProfile(active);
      } else {
        await settingsRepo.clearActiveProfileId();
        setActiveProfileId(undefined);
        setStatus(
          active
            ? 'The saved active profile was invalid and has been deactivated.'
            : 'The saved active profile reference was missing and has been cleared.'
        );
      }
    }
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
      // Importing a new resume must not silently replace an existing active profile.
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString()
    };
    if (!isValidUserProfileRecord(nextProfile)) {
      setStatus('The parsed profile did not pass local storage validation.');
      return;
    }
    const resumeDocument: ResumeDocument = {
      id: crypto.randomUUID(),
      fileName,
      sourceType,
      text,
      importedAt: new Date().toISOString(),
      warnings: parsed.warnings
    };
    try {
      await saveProfileWithResume(nextProfile, resumeDocument);
    } catch {
      setStatus('Resume and profile could not be saved. Neither record was changed.');
      return;
    }
    setProfile(nextProfile);
    setParseSummary(parsed.summary);
    setWarnings(parsed.summary.needsReview);
    setSavedProfiles((await profileRepo.list()).filter(isValidUserProfileRecord));
    try {
      await settingsRepo.setActiveProfileId(nextProfile.id);
      setActiveProfileId(nextProfile.id);
      setStatus(
        fileName
          ? `${fileName} imported and profile saved locally.`
          : 'Resume parsed and profile saved locally.'
      );
    } catch {
      setStatus(
        'The resume and profile were saved, but activation failed. Select the saved profile to retry.'
      );
    }
  }

  async function saveProfile() {
    const next = { ...profile, updatedAt: new Date().toISOString() };
    if (!isValidUserProfileRecord(next)) {
      setStatus('The profile contains invalid or oversized data and was not saved.');
      return;
    }
    if (
      (activeProfileId && next.id !== activeProfileId) ||
      (!activeProfileId && (await profileRepo.get(next.id)))
    ) {
      setStatus('This profile ID is not active or is already saved. Select it or start a new profile.');
      return;
    }
    try {
      await profileRepo.save(next);
    } catch {
      setStatus('Profile storage failed. Your saved profile was not updated.');
      return;
    }
    setProfile(next);
    setSavedProfiles((await profileRepo.list()).filter(isValidUserProfileRecord));
    try {
      await settingsRepo.setActiveProfileId(next.id);
      setActiveProfileId(next.id);
      setStatus('Profile saved locally.');
    } catch {
      setStatus('Profile saved, but activation failed. Select the profile to retry.');
    }
  }

  async function activateSavedProfile(id: string) {
    try {
      const selected = await profileRepo.get(id);
      if (!selected || !isValidUserProfileRecord(selected)) {
        await loadOptions();
        setStatus('Selected profile is unavailable or invalid.');
        return;
      }
      await settingsRepo.setActiveProfileId(selected.id);
      setActiveProfileId(selected.id);
      setProfile(selected);
      setParseSummary(undefined);
      setWarnings([]);
      setStatus('Saved profile activated locally.');
    } catch {
      setStatus('Saved profile could not be activated.');
    }
  }

  async function startNewProfile() {
    if (!window.confirm('Start a blank profile? Any unsaved profile edits will be discarded.'))
      return;
    try {
      await settingsRepo.clearActiveProfileId();
      setActiveProfileId(undefined);
      setProfile({ ...emptyUserProfile(), id: crypto.randomUUID() });
      setParseSummary(undefined);
      setWarnings([]);
      setStatus('New profile ready for review and saving.');
    } catch {
      setStatus('Could not start a new profile.');
    }
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
      setSavedSearches((await searchRepo.list()).filter(isValidSavedSearchRecord));
      setSearchForm({ label: '', url: '', keywords: '', location: '', remoteOnly: false });
      setStatus('Saved search stored locally.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Saved search could not be created.');
    }
  }

  async function refreshHistory() {
    try {
      const [jobs, sessions] = await Promise.all([jobRepo.list(), sessionRepo.list()]);
      const validJobs = jobs.filter(isValidJobPostingRecord);
      const validSessions = sessions.filter(isValidApplicationSessionRecord);
      setSavedJobs(orderSavedJobs(validJobs));
      setSavedSessions(orderSavedSessions(validSessions));
      setStatus(
        jobs.length === validJobs.length && sessions.length === validSessions.length
          ? 'Local job and application history refreshed.'
          : 'History refreshed. Invalid stored records were hidden.'
      );
    } catch {
      setStatus('Local history could not be refreshed. Existing records were not changed.');
    }
  }

  async function openSavedHistoryPage(url: string) {
    const safeUrl = normalizePageUrl(url);
    if (!safeUrl || safeUrl !== url) {
      setStatus('Saved page URL was invalid. No tab was opened.');
      return;
    }
    try {
      await chrome.tabs.create({ url: safeUrl, active: true });
      setStatus('Saved page opened in a new tab. Review it before taking any action.');
    } catch {
      setStatus('Could not open the saved page. Check the browser permissions.');
    }
  }

  async function openSearch(search: SavedSearch) {
    try {
      const safeUrl = normalizeSavedSearchUrl(search.url);
      if (safeUrl !== search.url) {
        setStatus('Saved search URL failed validation. It was not opened.');
        return;
      }
      await chrome.tabs.create({ url: safeUrl, active: true });
      setStatus('Search opened in a new tab. Review the listings before marking it checked.');
    } catch {
      setStatus('Could not open the saved search. Check the URL or browser permissions.');
    }
  }

  async function checkSearch(search: SavedSearch) {
    try {
      const latest = await searchRepo.get(search.id);
      if (!latest || !isValidSavedSearchRecord(latest)) {
        setStatus('Saved search was unavailable or invalid. Nothing was marked reviewed.');
        return;
      }
      const updated = markSavedSearchChecked(
        latest,
        'Manually reviewed. No background crawling was run.'
      );
      await searchRepo.save(updated);
      setSavedSearches((await searchRepo.list()).filter(isValidSavedSearchRecord));
      setStatus('Saved search marked reviewed. No background crawling was run.');
    } catch {
      setStatus('Could not save the review status. Existing search history was preserved.');
    }
  }

  async function deleteSearch(id: string) {
    if (!window.confirm('Delete this saved search from local storage?')) return;
    try {
      await searchRepo.delete(id);
      setSavedSearches((await searchRepo.list()).filter(isValidSavedSearchRecord));
      setStatus('Saved search deleted locally.');
    } catch {
      setStatus('Saved search could not be deleted.');
    }
  }

  async function exportLocalData() {
    const confirmed = window.confirm(
      'Exported JSON may contain private profile, resume-derived, job, and application data. Keep it out of git and shared folders.'
    );
    if (!confirmed) return;
    try {
      const {
        profiles,
        savedSearches,
        jobPostings,
        applicationSessions,
        resumeDocuments,
        fieldMappings,
        tailoringSuggestions
      } = await readLocalDataSnapshot();
      if (
        !profiles.every(isValidUserProfileRecord) ||
        !savedSearches.every(isValidSavedSearchRecord) ||
        !jobPostings.every(isValidJobPostingRecord) ||
        !applicationSessions.every(isValidApplicationSessionRecord) ||
        !resumeDocuments.every(isValidResumeDocumentRecord) ||
        !fieldMappings.every(isValidStoredFieldMappingRecord) ||
        !tailoringSuggestions.every(isValidTailoringSuggestionRecord)
      ) {
        setStatus('Local data contains an invalid record. Export was stopped to avoid copying it.');
        return;
      }
      const data = createLocalDataExport({
        profiles,
        savedSearches,
        jobPostings,
        applicationSessions,
        resumeDocuments,
        fieldMappings,
        tailoringSuggestions,
        settings
      });
      if (!validateLocalDataImport(data).valid) {
        setStatus(
          'Export stopped: local records cannot be restored safely. Review invalid or duplicate data.'
        );
        return;
      }
      const backup = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      if (backup.size > maxImportBytes) {
        setStatus(
          'Backup exceeds the 5 MB restore limit and was not downloaded. Saved records are unchanged.'
        );
        return;
      }
      const url = URL.createObjectURL(backup);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rapid-robot-job-assistant-export.json';
      link.hidden = true;
      document.body.append(link);
      try {
        link.click();
      } finally {
        window.setTimeout(() => {
          link.remove();
          URL.revokeObjectURL(url);
        }, 1000);
      }
      setStatus(
        'Supported record backup created. Keep the private JSON file out of shared folders.'
      );
    } catch {
      setStatus('Backup could not be created. Existing local records were not changed.');
    }
  }

  async function previewImport(file?: File) {
    const generation = ++importGeneration.current;
    setValidatedImport(undefined);
    setImportPreview('');
    if (!file) return;
    if (file.size > maxImportBytes) {
      setImportPreview('Import file is too large. Keep JSON exports under 5 MB.');
      setStatus('Import file did not validate.');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (generation !== importGeneration.current) return;
      const preview = validateLocalDataImport(parsed);
      setValidatedImport(preview.data);
      setImportPreview(
        preview.valid
          ? [
              preview.counts.profiles + ' profiles',
              preview.counts.savedSearches + ' searches',
              preview.counts.jobPostings + ' jobs',
              preview.counts.applicationSessions + ' sessions',
              preview.counts.resumeDocuments + ' resumes',
              preview.counts.fieldMappings + ' mappings',
              preview.counts.tailoringSuggestions + ' suggestions'
            ].join(', ') + '.'
          : preview.errors.join(' ')
      );
      setStatus(
        preview.valid
          ? 'Import preview validated. Confirm to add these records without changing existing data.'
          : 'Import file did not validate.'
      );
    } catch {
      if (generation !== importGeneration.current) return;
      setImportPreview('Invalid JSON file.');
      setStatus('Import file did not validate.');
    }
  }

  async function restoreValidatedImport() {
    if (!validatedImport || importPending) return;
    if (
      !window.confirm(
        'Add the validated backup records to this browser? Existing records are not replaced. ' +
          'If any record ID already exists, the entire import will be cancelled.'
      )
    ) return;
    setImportPending(true);
    let counts: ImportPreview['counts'];
    try {
      counts = await importLocalDataAdditively(validatedImport);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? 'Import cancelled: ' + error.message
          : 'Import failed. Existing data was preserved.'
      );
      setImportPending(false);
      return;
    }
    ++importGeneration.current;
    setValidatedImport(undefined);
    setImportPreview('');
    try {
      await loadOptions();
      setStatus(
        'Imported ' + [
          counts.profiles + ' profiles',
          counts.savedSearches + ' searches',
          counts.jobPostings + ' jobs',
          counts.applicationSessions + ' sessions',
          counts.resumeDocuments + ' resumes',
          counts.fieldMappings + ' mappings',
          counts.tailoringSuggestions + ' suggestions'
        ].join(', ') + '. Active profile and settings were not changed.'
      );
    } catch {
      setStatus(
        'The backup was imported successfully, but the options view could not refresh. ' +
          'Reopen Options to reload the data.'
      );
    } finally {
      setImportPending(false);
    }
  }

  async function clearLocalData() {
    const confirmed = window.confirm(
      'Clear local extension settings, profiles, saved jobs, searches, and sessions?'
    );
    if (!confirmed) return;
    // Clear the transactional database first. On database failure, keep the
    // independent Chrome settings and remembered target intact.
    try {
      await clearAllIndexedDbData();
    } catch {
      setStatus(
        'Local cleanup failed. IndexedDB changes were rolled back; browser settings were preserved.'
      );
      return;
    }

    // Chrome storage and tab tracking are independent persistence systems.
    // Never report the entire cleanup as complete if either step fails.
    try {
      await settingsRepo.clearSettings();
      await clearTargetTab();
    } catch {
      setStatus(
        'Saved database records were cleared, but some browser settings or target-page data ' +
          'could not be cleared. Reopen Options and retry cleanup.'
      );
      return;
    }
    setSettings(defaultSettings);
    setProfile(emptyUserProfile());
    setActiveProfileId(undefined);
    setSavedProfiles([]);
    setSavedSearches([]);
    setSavedJobs([]);
    setSavedSessions([]);
    setResumeText('');
    setWarnings([]);
    setParseSummary(undefined);
    ++importGeneration.current;
    setValidatedImport(undefined);
    setImportPreview('');
    setStatus('Local extension data cleared.');
  }

  async function clearTargetPage() {
    await clearTargetTab();
    setStatus('Saved target page cleared.');
  }

  async function clearSavedSearches() {
    if (!window.confirm('Delete all saved searches from local extension storage?')) return;
    try {
      await clearIndexedDbStores(['savedSearches']);
      setSavedSearches([]);
      setStatus('Saved searches cleared locally.');
    } catch {
      setStatus('Saved search cleanup failed. Existing search records were preserved.');
    }
  }

  async function clearSavedJobsAndSessions() {
    if (!window.confirm('Delete saved jobs and application sessions from local extension storage?'))
      return;
    try {
      await clearIndexedDbStores([
        'jobPostings',
        'applicationSessions',
        'fieldMappings',
        'tailoringSuggestions'
      ]);
      setSavedJobs([]);
      setSavedSessions([]);
      setStatus(
        'Saved jobs, application sessions, field mappings, and tailoring suggestions cleared locally.'
      );
    } catch {
      setStatus('Job history cleanup failed. Existing records were preserved.');
    }
  }

  async function clearSavedProfiles() {
    if (
      !window.confirm(
        'Delete saved profiles and resume-derived records from local extension storage?'
      )
    )
      return;
    try {
      await clearIndexedDbStores(['profiles', 'resumeDocuments', 'tailoringSuggestions']);
    } catch {
      setStatus('Profile cleanup failed. Existing profiles and resume records were preserved.');
      return;
    }
    setProfile(emptyUserProfile());
    setSavedProfiles([]);
    setResumeText('');
    setWarnings([]);
    setParseSummary(undefined);
    try {
      await settingsRepo.clearActiveProfileId();
      setActiveProfileId(undefined);
      setStatus('Saved profiles and resume-derived records cleared locally.');
    } catch {
      setStatus(
        'Profile records were cleared, but the active profile selection could not be cleared. ' +
          'Reopen Options to retry cleanup.'
      );
    }
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
            savedProfiles={savedProfiles}
            importPending={importPending}
            parseSummary={parseSummary}
            onProfileChange={setProfile}
            onActivateProfile={activateSavedProfile}
            onCreateNewProfile={startNewProfile}
            onSaveProfile={saveProfile}
          />
          <JobHistoryPanel
            jobs={savedJobs}
            sessions={savedSessions}
            onRefresh={refreshHistory}
            onOpenPage={openSavedHistoryPage}
          />
        </div>
        <aside className="options-sidebar stack">
          <AiProviderSettingsPanel />
          <SavedSearchesPanel
            searchForm={searchForm}
            savedSearches={savedSearches}
            onSearchFormChange={setSearchForm}
            onCreateSearch={createSearch}
            onOpenSearch={openSearch}
            onCheckSearch={checkSearch}
            onDeleteSearch={deleteSearch}
          />
          <PrivacyControlsPanel
            importPreview={importPreview}
            importPending={importPending}
            canRestoreImport={Boolean(validatedImport)}
            onExport={exportLocalData}
            onPreviewImport={previewImport}
            onRestoreImport={restoreValidatedImport}
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
  savedProfiles,
  importPending,
  parseSummary,
  onProfileChange,
  onActivateProfile,
  onCreateNewProfile,
  onSaveProfile
}: {
  profile: UserProfile;
  activeProfileId?: string;
  savedProfiles: UserProfile[];
  importPending: boolean;
  parseSummary?: ResumeParseSummary;
  onProfileChange: (profile: UserProfile) => void;
  onActivateProfile: (id: string) => void;
  onCreateNewProfile: () => void;
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
      <div className="row">
        {savedProfiles.length > 0 && (
          <label>
            Saved profiles
            <select
              aria-label="Saved profiles"
              value={activeProfileId ?? ''}
              disabled={importPending}
              onChange={(event) => {
                const id = event.target.value;
                if (!id) return;
                if (
                  !window.confirm(
                    'Activate this saved profile? Unsaved profile edits will be discarded.'
                  )
                ) {
                  event.target.value = activeProfileId ?? '';
                  return;
                }
                void onActivateProfile(id);
              }}
            >
              <option value="" disabled>
                Choose a saved profile
              </option>
              {savedProfiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.contact.fullName || item.contact.email || item.id}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="secondary" onClick={onCreateNewProfile} disabled={importPending}>
          New Profile
        </button>
      </div>
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

function AiProviderSettingsPanel() {
  return (
    <section className="card stack options-card compact-card">
      <h2>AI Provider Settings</h2>
      <label>
        <input type="checkbox" checked readOnly disabled /> Local-only mode
      </label>
      <label>
        <input type="checkbox" checked={false} readOnly disabled /> Network AI provider
      </label>
      <select value="manual" disabled>
        <option value="manual">Manual local rules</option>
      </select>
      <p className="muted">
        Network AI providers are not implemented in this build. No resume, job-page, application,
        field, or prompt data is sent to an AI provider.
      </p>
    </section>
  );
}

function SavedSearchesPanel({
  searchForm,
  savedSearches,
  onSearchFormChange,
  onCreateSearch,
  onOpenSearch,
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
  onOpenSearch: (search: SavedSearch) => void;
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
            <button className="secondary" onClick={() => onOpenSearch(search)}>
              Open Search
            </button>
            <button className="secondary" onClick={() => onCheckSearch(search)}>
              Mark Reviewed
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

function JobHistoryPanel({
  jobs,
  sessions,
  onRefresh,
  onOpenPage
}: {
  jobs: JobPosting[];
  sessions: ApplicationSession[];
  onRefresh: () => void;
  onOpenPage: (url: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(50);
  const [query, setQuery] = useState('');
  const matchingJobs = useMemo(() => filterSavedJobs(jobs, query), [jobs, query]);
  const matchingSessions = useMemo(() => filterSavedSessions(sessions, query), [sessions, query]);
  return (
    <section className="card stack options-card">
      <h2>Saved Jobs and Applications</h2>
      <p className="muted">
        These are local records, not automatic applications. You control whether to submit.
      </p>
      <div className="row">
        <span className="pill">{jobs.length} saved jobs</span>
        <span className="pill">{sessions.length} application sessions</span>
        <button className="secondary" onClick={onRefresh}>Refresh History</button>
      </div>
      <label>
        Filter saved history
        <input
          type="search"
          aria-label="Filter saved history"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleCount(50);
          }}
          placeholder="Job title, company, status, or notes"
        />
      </label>
      <p className="muted">
        Showing {matchingJobs.length} matching jobs and {matchingSessions.length} matching sessions.
      </p>
      <h3>Job Postings</h3>
      {matchingJobs.length === 0 && <p className="empty-state">No matching saved jobs.</p>}
      {matchingJobs.slice(0, visibleCount).map((job) => (
        <div className="mini-card stack" key={job.id}>
          <strong>{job.title}</strong>
          <p className="muted">
            {[job.company, job.location, job.remoteStatus, job.status]
              .filter(Boolean)
              .join(' | ')}
          </p>
          <p className="muted">{job.sourceUrl}</p>
          <button className="secondary" onClick={() => onOpenPage(job.sourceUrl)}>
            Open Job Posting
          </button>
        </div>
      ))}
      <h3>Application Sessions</h3>
      {matchingSessions.length === 0 && (
        <p className="empty-state">No matching application sessions.</p>
      )}
      {matchingSessions.slice(0, visibleCount).map((session) => (
        <div className="mini-card stack" key={session.id}>
          <strong>{session.job?.title || session.pageUrl}</strong>
          <p className="muted">{session.status} | Updated {session.updatedAt}</p>
          {session.manualVerificationRequired && <p className="warn">Manual verification needed.</p>}
          {session.notes && <p className="muted">{session.notes.slice(0, 300)}</p>}
          <button className="secondary" onClick={() => onOpenPage(session.pageUrl)}>
            Open Application Page
          </button>
        </div>
      ))}
      {(matchingJobs.length > visibleCount || matchingSessions.length > visibleCount) && (
        <button className="secondary" onClick={() => setVisibleCount((count) => count + 50)}>
          Show More History
        </button>
      )}
    </section>
  );
}

function PrivacyControlsPanel({
  importPreview,
  importPending,
  canRestoreImport,
  onExport,
  onPreviewImport,
  onRestoreImport,
  onClearTargetPage,
  onClearSavedSearches,
  onClearSavedJobsAndSessions,
  onClearSavedProfiles,
  onClearLocalData
}: {
  importPreview: string;
  importPending: boolean;
  canRestoreImport: boolean;
  onExport: () => void;
  onPreviewImport: (file?: File) => void;
  onRestoreImport: () => void;
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
      <p className="muted">
        The backup includes profiles, saved searches, jobs, application sessions, saved resume
        text, field mappings, and tailoring suggestions. It excludes browser settings and the
        active-profile selection. It contains private data and supports files up to 5 MB.
      </p>
      <button className="secondary" onClick={onExport} disabled={importPending}>
        Export Local Record Backup
      </button>
      <label className="file-picker secondary">
        Preview Local Record Backup JSON
        <input
          type="file"
          accept="application/json,.json"
          disabled={importPending}
          onChange={(event) => {
            void onPreviewImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {importPreview && <p className="muted">{importPreview}</p>}
      {canRestoreImport && (
        <button className="secondary" onClick={onRestoreImport} disabled={importPending}>
          {importPending ? 'Importing Records...' : 'Restore Validated Records'}
        </button>
      )}
      <div className="stack mini-card">
        <h3>Local Data Cleanup</h3>
        <button className="secondary" onClick={onClearTargetPage} disabled={importPending}>
          Clear Target Page
        </button>
        <button className="secondary" onClick={onClearSavedSearches} disabled={importPending}>
          Clear Saved Searches
        </button>
        <button
          className="secondary"
          onClick={onClearSavedJobsAndSessions}
          disabled={importPending}
        >
          Clear Saved Jobs and Sessions
        </button>
        <button className="secondary" onClick={onClearSavedProfiles} disabled={importPending}>
          Clear Saved Profiles
        </button>
      </div>
      <button className="danger danger-inline" onClick={onClearLocalData} disabled={importPending}>
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
        <div className="doc-link" key={href}>
          <strong>{label}</strong>
          <span>{description}</span>
          <span className="muted">Repository document: {href.replace('../', '')}</span>
        </div>
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
