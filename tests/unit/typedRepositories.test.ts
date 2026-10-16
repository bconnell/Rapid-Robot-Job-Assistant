import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSession } from '../../src/shared/models/ApplicationSession';
import type { JobPosting } from '../../src/shared/models/JobPosting';
import type { UserProfile } from '../../src/shared/models/UserProfile';
import type { ResumeDocument } from '../../src/shared/models/ResumeDocument';
import {
  clearAllIndexedDbData,
  clearIndexedDbStores,
  IndexedDbRepository,
  readLocalDataSnapshot,
  saveProfileWithResume
} from '../../src/shared/storage/IndexedDbRepository';
import {
  ApplicationSessionRepository,
  JobPostingRepository,
  ProfileRepository,
  ResumeDocumentRepository,
  SavedSearchRepository
} from '../../src/shared/storage/TypedRepositories';
import { createSavedSearch } from '../../src/shared/jobs/SavedSearchService';

beforeEach(async () => {
  await clearAllIndexedDbData();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('typed repositories', () => {
  it('saves and loads profiles', async () => {
    const repo = new ProfileRepository();
    const profile: UserProfile = {
      id: 'profile-1',
      contact: { fullName: 'Jordan Lee' },
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      projects: [],
      desiredTitles: [],
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    await repo.save(profile);
    expect((await repo.get('profile-1'))?.contact.fullName).toBe('Jordan Lee');
  });

  it('dedupes saved jobs by URL and job details', async () => {
    const repo = new JobPostingRepository();
    const job: JobPosting = {
      id: 'job-1',
      title: 'Frontend Engineer',
      company: 'Lakeview Systems',
      location: 'Remote',
      descriptionText: 'React and TypeScript',
      detectedKeywords: ['react'],
      sourceUrl: 'https://jobs.example.test/123?utm_source=test',
      sourceSite: 'jobs.example.test',
      dateFound: '2026-01-01T00:00:00.000Z'
    };

    await repo.saveOrUpdate(job);
    await repo.saveOrUpdate({ ...job, id: 'job-2', sourceUrl: 'https://jobs.example.test/123' });
    expect(await repo.list()).toHaveLength(1);
  });

  it('preserves malformed historical jobs without blocking valid new saves', async () => {
    const raw = new IndexedDbRepository('jobPostings');
    const corrupted = { id: 'broken', title: null, sourceUrl: 42 };
    await raw.put('broken', corrupted);
    const repo = new JobPostingRepository();
    const fresh: JobPosting = {
      id: 'healthy',
      title: 'Safe Developer',
      descriptionText: 'Synthetic job history.',
      detectedKeywords: [],
      sourceUrl: 'https://jobs.example.test/role/healthy',
      sourceSite: 'jobs.example.test',
      dateFound: '2026-10-15T00:00:00.000Z'
    };
    expect((await repo.saveOrUpdate(fresh)).created).toBe(true);
    expect(await raw.get('broken')).toEqual(corrupted);
    expect(await repo.get(fresh.id)).toBeDefined();
  });

  it('skips malformed session URLs without blocking valid session retrieval', async () => {
    await new IndexedDbRepository('applicationSessions').put('broken', {
      id: 'broken',
      pageUrl: 42
    });
    const good: ApplicationSession = {
      id: 'healthy',
      pageUrl: 'https://jobs.example.test/apply/healthy',
      startedAt: '2026-10-15T00:00:00.000Z',
      updatedAt: '2026-10-15T00:00:00.000Z',
      fieldPreview: [],
      fillResults: [],
      manualVerificationRequired: false,
      notes: 'Synthetic healthy history',
      status: 'draft',
      submittedByUser: false
    };
    const repo = new ApplicationSessionRepository();
    await repo.save(good);
    expect(await repo.findByPageUrl(good.pageUrl)).toEqual(good);
    expect(await new IndexedDbRepository('applicationSessions').get('broken')).toEqual({
      id: 'broken',
      pageUrl: 42
    });
  });

  it('atomically deduplicates simultaneous job saves', async () => {
    const repo = new JobPostingRepository();
    const job: JobPosting = {
      id: 'competing-job-a',
      title: 'Frontend Engineer',
      company: 'Example Company',
      location: 'Remote',
      descriptionText: 'Build safe local tools.',
      detectedKeywords: ['TypeScript'],
      sourceUrl: 'https://jobs.example.test/456',
      sourceSite: 'jobs.example.test',
      dateFound: '2026-10-15T00:00:00.000Z'
    };
    const results = await Promise.all([
      repo.saveOrUpdate(job),
      repo.saveOrUpdate({ ...job, id: 'competing-job-b' })
    ]);
    expect(await repo.list()).toHaveLength(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results[0].job.id).toBe(results[1].job.id);
  });

  it('returns the latest stored session for duplicate application page URLs', async () => {
    const repo = new ApplicationSessionRepository();
    const first: ApplicationSession = {
      id: 'session-old',
      pageUrl: 'https://apply.example.test/role',
      startedAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      fieldPreview: [],
      fillResults: [],
      manualVerificationRequired: false,
      notes: 'Older history',
      status: 'draft',
      submittedByUser: false
    };
    await repo.save(first);
    await repo.save({
      ...first,
      id: 'session-new',
      notes: 'Most recent history',
      updatedAt: '2026-10-15T00:00:00.000Z'
    });
    expect((await repo.findByPageUrl(first.pageUrl))?.notes).toBe('Most recent history');
  });

  it('saves searches and application sessions', async () => {
    const searchRepo = new SavedSearchRepository();
    const sessionRepo = new ApplicationSessionRepository();
    const search = createSavedSearch({
      label: 'Frontend',
      url: 'https://jobs.example.test/search'
    });
    const session: ApplicationSession = {
      id: 'session-1',
      pageUrl: 'https://apply.example.test/form',
      startedAt: '2026-01-01T00:00:00.000Z',
      fieldPreview: [],
      fillResults: [],
      manualVerificationRequired: false,
      notes: 'Fake note',
      status: 'draft',
      submittedByUser: false,
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    await searchRepo.save(search);
    await sessionRepo.save(session);

    expect(await searchRepo.list()).toHaveLength(1);
    expect((await sessionRepo.findByPageUrl(session.pageUrl))?.notes).toBe('Fake note');
  });
});

describe('atomic storage lifecycle', () => {
  it('reads all exported collections from a single successful snapshot', async () => {
    const profileRepo = new ProfileRepository();
    const savedSearchRepo = new SavedSearchRepository();
    await profileRepo.save({
      id: 'snapshot-profile',
      contact: { fullName: 'Synthetic User' },
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      projects: [],
      desiredTitles: [],
      updatedAt: '2026-10-15T00:00:00.000Z'
    });
    const search = createSavedSearch({
      label: 'Synthetic search',
      url: 'https://jobs.example.test/search'
    });
    await savedSearchRepo.save(search);
    const snapshot = await readLocalDataSnapshot();
    expect(snapshot.profiles.map((item) => item.id)).toEqual(['snapshot-profile']);
    expect(snapshot.savedSearches).toEqual([search]);
    expect(snapshot.jobPostings).toEqual([]);
    expect(snapshot.applicationSessions).toEqual([]);
  });

  it('rolls back all cleared stores if a later clear fails', async () => {
    const profileRepo = new ProfileRepository();
    const searchRepo = new SavedSearchRepository();
    const profile: UserProfile = {
      id: 'preserve-profile',
      contact: { fullName: 'Preserved Fake User' },
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      projects: [],
      desiredTitles: [],
      updatedAt: '2026-10-15T00:00:00.000Z'
    };
    const search = createSavedSearch({
      label: 'Preserved fake search',
      url: 'https://jobs.example.test/search'
    });
    await profileRepo.save(profile);
    await searchRepo.save(search);

    const originalClear = IDBObjectStore.prototype.clear;
    const injected = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(
      function (this: IDBObjectStore) {
        if (this.name === 'savedSearches') {
          throw new DOMException('Synthetic clear failure', 'UnknownError');
        }
        return originalClear.call(this);
      }
    );
    try {
      await expect(clearAllIndexedDbData()).rejects.toThrow(/Synthetic clear failure/);
    } finally {
      injected.mockRestore();
    }

    expect(await profileRepo.get(profile.id)).toEqual(profile);
    expect(await searchRepo.get(search.id)).toEqual(search);
  });
});

describe('atomic profile and targeted cleanup', () => {
  const profile: UserProfile = {
    id: 'save-profile',
    contact: { fullName: 'Example Applicant' },
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    desiredTitles: [],
    updatedAt: '2026-10-15T00:00:00.000Z'
  };
  const resume: ResumeDocument = {
    id: 'save-resume',
    sourceType: 'pasted-text',
    text: 'Synthetic resume content',
    importedAt: '2026-10-15T00:00:00.000Z',
    warnings: []
  };

  it('commits a matching profile and resume together', async () => {
    await saveProfileWithResume(profile, resume);
    expect(await new ProfileRepository().get(profile.id)).toEqual(profile);
    expect(await new ResumeDocumentRepository().get(resume.id)).toEqual(resume);
  });

  it('rejects a conflicting imported profile without changing earlier saved records', async () => {
    const existing = { ...profile, contact: { fullName: 'Existing Profile' } };
    await new ProfileRepository().save(existing);
    await expect(saveProfileWithResume(profile, resume)).rejects.toThrow();
    expect(await new ProfileRepository().get(profile.id)).toEqual(existing);
    expect(await new ResumeDocumentRepository().get(resume.id)).toBeUndefined();
  });

  it('rejects a conflicting imported resume without replacing the stored resume', async () => {
    const existing = { ...resume, text: 'Previous synthetic resume' };
    await new ResumeDocumentRepository().save(existing);
    await expect(saveProfileWithResume(profile, resume)).rejects.toThrow();
    expect(await new ProfileRepository().get(profile.id)).toBeUndefined();
    expect(await new ResumeDocumentRepository().get(resume.id)).toEqual(existing);
  });

  it('rolls back profile writes when the resume write fails', async () => {
    const originalPut = IDBObjectStore.prototype.put;
    const failingPut = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
      function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (this.name === 'resumeDocuments') {
          throw new DOMException('Injected resume storage failure', 'QuotaExceededError');
        }
        return originalPut.call(this, value, key);
      }
    );
    try {
      await expect(saveProfileWithResume(profile, resume)).rejects.toThrow(
        /Injected resume storage failure/
      );
    } finally {
      failingPut.mockRestore();
    }
    expect(await new ProfileRepository().get(profile.id)).toBeUndefined();
    expect(await new ResumeDocumentRepository().get(resume.id)).toBeUndefined();
  });

  it('preserves unrelated data during targeted cleanup', async () => {
    await saveProfileWithResume(profile, resume);
    const savedSearch = createSavedSearch({
      label: 'Preserved search',
      url: 'https://jobs.example.test/search'
    });
    await new SavedSearchRepository().save(savedSearch);
    await clearIndexedDbStores(['profiles', 'resumeDocuments']);
    expect(await new ProfileRepository().list()).toEqual([]);
    expect(await new ResumeDocumentRepository().list()).toEqual([]);
    expect(await new SavedSearchRepository().get(savedSearch.id)).toEqual(savedSearch);
  });

  it('rolls back a failed targeted cleanup of related stores', async () => {
    await saveProfileWithResume(profile, resume);
    const originalClear = IDBObjectStore.prototype.clear;
    const failingClear = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(
      function (this: IDBObjectStore) {
        if (this.name === 'resumeDocuments') {
          throw new DOMException('Injected targeted cleanup failure', 'UnknownError');
        }
        return originalClear.call(this);
      }
    );
    try {
      await expect(clearIndexedDbStores(['profiles', 'resumeDocuments'])).rejects.toThrow(
        /Injected targeted cleanup failure/
      );
    } finally {
      failingClear.mockRestore();
    }
    expect(await new ProfileRepository().get(profile.id)).toEqual(profile);
    expect(await new ResumeDocumentRepository().get(resume.id)).toEqual(resume);
  });
});
