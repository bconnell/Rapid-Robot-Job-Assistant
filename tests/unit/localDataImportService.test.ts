import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalDataExport,
  validateLocalDataImport
} from '../../src/shared/data/LocalDataTransfer';
import { importLocalDataAdditively } from '../../src/shared/data/LocalDataImportService';
import { clearAllIndexedDbData, IndexedDbRepository } from '../../src/shared/storage/IndexedDbRepository';
import {
  ApplicationSessionRepository,
  JobPostingRepository,
  ProfileRepository,
  SavedSearchRepository
} from '../../src/shared/storage/TypedRepositories';
import { defaultSettings } from '../../src/shared/storage/ChromeStorageRepository';
import type { UserProfile } from '../../src/shared/models/UserProfile';
import type { JobPosting } from '../../src/shared/models/JobPosting';
import type { ApplicationSession } from '../../src/shared/models/ApplicationSession';

const profile: UserProfile = {
  id: 'fake-profile-1',
  contact: { fullName: 'Alex Example', email: 'alex@example.test' },
  skills: ['TypeScript'],
  experience: [],
  education: [],
  certifications: [],
  projects: [],
  desiredTitles: ['Software Developer'],
  updatedAt: '2026-10-15T00:00:00.000Z'
};
const job: JobPosting = {
  id: 'fake-job-1',
  title: 'Developer',
  descriptionText: 'Write reliable software.',
  detectedKeywords: ['TypeScript'],
  sourceUrl: 'https://jobs.example.test/role/1',
  sourceSite: 'jobs.example.test',
  dateFound: '2026-10-15T00:00:00.000Z'
};
const session: ApplicationSession = {
  id: 'fake-session-1',
  jobPostingId: job.id,
  pageUrl: 'https://jobs.example.test/apply/1',
  startedAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
  fieldPreview: [],
  fillResults: [],
  manualVerificationRequired: false,
  notes: 'Synthetic test note',
  status: 'draft',
  submittedByUser: false
};
function backup() {
  return createLocalDataExport({
    profiles: [profile],
    savedSearches: [],
    jobPostings: [job],
    applicationSessions: [session],
    settings: defaultSettings
  });
}
beforeEach(async () => {
  await clearAllIndexedDbData();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('additive local data import', () => {
  it('restores exported collections without replacing unrelated local records', async () => {
    const searches = new SavedSearchRepository();
    const existingSearch = {
      id: 'existing-search',
      label: 'Existing search',
      url: 'https://jobs.example.test/search',
      createdAt: '2026-10-15T00:00:00.000Z',
      enabled: true
    };
    await searches.save(existingSearch);
    const incoming = backup();
    expect(validateLocalDataImport(incoming).valid).toBe(true);
    expect(await importLocalDataAdditively(incoming)).toEqual({
      profiles: 1,
      savedSearches: 0,
      jobPostings: 1,
      applicationSessions: 1,
      resumeDocuments: 0,
      fieldMappings: 0,
      tailoringSuggestions: 0
    });
    expect(await new ProfileRepository().get(profile.id)).toEqual(profile);
    expect(await new JobPostingRepository().get(job.id)).toEqual(job);
    expect(await new ApplicationSessionRepository().get(session.id)).toEqual(session);
    expect(await searches.get(existingSearch.id)).toEqual(existingSearch);
  });

  it('round-trips saved resume text, reviewed mappings and local suggestions', async () => {
    const resume = {
      id: 'fake-resume-1',
      sourceType: 'pasted-text' as const,
      text: 'Synthetic developer resume text for test storage.',
      importedAt: '2026-10-15T00:00:00.000Z',
      warnings: []
    };
    const mapping = {
      id: 'fake-mapping-1',
      candidate: {
        selector: '#email',
        tagName: 'input',
        inputType: 'email',
        options: [],
        required: true,
        visible: true,
        stableSelector: true
      },
      kind: 'email' as const,
      confidence: 0.96,
      sensitive: false,
      fillable: true,
      requiresDirectReview: false
    };
    const suggestion = {
      id: 'fake-suggestion-1',
      originalText: 'Experience with TypeScript',
      suggestedText: 'Experience with TypeScript',
      reason: 'Already supported by the profile',
      matchedJobKeywords: ['TypeScript'],
      riskLevel: 'low' as const,
      status: 'suggested' as const
    };
    const incoming = {
      ...backup(),
      resumeDocuments: [resume],
      fieldMappings: [mapping],
      tailoringSuggestions: [suggestion]
    };
    expect(validateLocalDataImport(incoming).valid).toBe(true);
    expect(await importLocalDataAdditively(incoming)).toMatchObject({
      resumeDocuments: 1,
      fieldMappings: 1,
      tailoringSuggestions: 1
    });
    expect(await new IndexedDbRepository('resumeDocuments').get(resume.id)).toEqual(resume);
    expect(await new IndexedDbRepository('fieldMappings').get(mapping.id)).toEqual(mapping);
    expect(await new IndexedDbRepository('tailoringSuggestions').get(suggestion.id)).toEqual(
      suggestion
    );
  });

  it('accepts older four-collection backups without new collections', async () => {
    const legacy = { ...backup() };
    delete legacy.resumeDocuments;
    delete legacy.fieldMappings;
    delete legacy.tailoringSuggestions;
    expect(validateLocalDataImport(legacy).valid).toBe(true);
    expect(await importLocalDataAdditively(legacy)).toMatchObject({
      profiles: 1,
      resumeDocuments: 0,
      fieldMappings: 0,
      tailoringSuggestions: 0
    });
  });

  it('rejects invalid data before writing records', async () => {
    await expect(importLocalDataAdditively({ ...backup(), schemaVersion: 2 })).rejects.toThrow(
      /validation/i
    );
    expect(await new ProfileRepository().list()).toEqual([]);
  });

  it('aborts on an existing ID without overwriting or inserting other records', async () => {
    const repo = new ProfileRepository();
    const existing = { ...profile, contact: { fullName: 'Existing Owner' } };
    await repo.save(existing);
    await expect(importLocalDataAdditively(backup())).rejects.toThrow(/same ID/i);
    expect(await repo.get(profile.id)).toEqual(existing);
    expect(await new JobPostingRepository().list()).toEqual([]);
    expect(await new ApplicationSessionRepository().list()).toEqual([]);
  });

  it('rolls back earlier inserts when a later store write fails', async () => {
    const originalPut = IDBObjectStore.prototype.put;
    const simulatedFailure = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
      function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (this.name === 'jobPostings') {
          throw new DOMException('Synthetic quota exhaustion', 'QuotaExceededError');
        }
        return originalPut.call(this, value, key);
      }
    );
    try {
      await expect(importLocalDataAdditively(backup())).rejects.toThrow(/quota/i);
    } finally {
      simulatedFailure.mockRestore();
    }
    expect(await new ProfileRepository().list()).toEqual([]);
    expect(await new JobPostingRepository().list()).toEqual([]);
    expect(await new ApplicationSessionRepository().list()).toEqual([]);
  });

  it('rejects a late collection ID collision without partially inserting earlier stores', async () => {
    const existingJobs = new JobPostingRepository();
    const existingJob = { ...job, title: 'Existing retained job' };
    await existingJobs.save(existingJob);
    await expect(importLocalDataAdditively(backup())).rejects.toThrow(/same ID/i);
    expect(await existingJobs.get(job.id)).toEqual(existingJob);
    expect(await new ProfileRepository().list()).toEqual([]);
    expect(await new ApplicationSessionRepository().list()).toEqual([]);
  });

  it('rolls back earlier collections if a saved resume ID collides', async () => {
    const saved = {
      id: 'already-there',
      sourceType: 'pasted-text',
      text: 'Existing synthetic resume text.',
      importedAt: '2026-10-15T00:00:00.000Z',
      warnings: []
    };
    await new IndexedDbRepository('resumeDocuments').put(saved.id, saved);
    const incoming = { ...backup(), resumeDocuments: [{ ...saved, text: 'New resume text' }] };
    await expect(importLocalDataAdditively(incoming)).rejects.toThrow(/same ID/i);
    expect(await new IndexedDbRepository('resumeDocuments').get(saved.id)).toEqual(saved);
    expect(await new ProfileRepository().list()).toEqual([]);
    expect(await new ApplicationSessionRepository().list()).toEqual([]);
  });

  it('serializes two competing restores so only one can create a record ID', async () => {
    const incoming = backup();
    const results = await Promise.allSettled([
      importLocalDataAdditively(incoming),
      importLocalDataAdditively(incoming)
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await new ProfileRepository().list()).toHaveLength(1);
    expect(await new JobPostingRepository().list()).toHaveLength(1);
    expect(await new ApplicationSessionRepository().list()).toHaveLength(1);
  });

  it('revalidates a previously reviewed object at commit time', async () => {
    const incoming = backup();
    expect(validateLocalDataImport(incoming).valid).toBe(true);
    Object.assign(incoming.profiles[0], { unexpectedSecret: 'must not persist' });
    await expect(importLocalDataAdditively(incoming)).rejects.toThrow(/validation/i);
    expect(await new ProfileRepository().list()).toEqual([]);
  });
});
