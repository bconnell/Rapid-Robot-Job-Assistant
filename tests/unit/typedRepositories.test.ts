import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSession } from '../../src/shared/models/ApplicationSession';
import type { JobPosting } from '../../src/shared/models/JobPosting';
import type { UserProfile } from '../../src/shared/models/UserProfile';
import {
  clearAllIndexedDbData,
  readLocalDataSnapshot
} from '../../src/shared/storage/IndexedDbRepository';
import {
  ApplicationSessionRepository,
  JobPostingRepository,
  ProfileRepository,
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
