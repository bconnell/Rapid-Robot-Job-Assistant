import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ApplicationSession } from '../../src/shared/models/ApplicationSession';
import type { JobPosting } from '../../src/shared/models/JobPosting';
import type { UserProfile } from '../../src/shared/models/UserProfile';
import { clearAllIndexedDbData } from '../../src/shared/storage/IndexedDbRepository';
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
