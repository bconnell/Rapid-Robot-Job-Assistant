import { describe, expect, it } from 'vitest';
import {
  createLocalDataExport,
  validateLocalDataImport
} from '../../src/shared/data/LocalDataTransfer';

describe('LocalDataTransfer', () => {
  it('exports safe settings without API endpoints', () => {
    const exported = createLocalDataExport({
      profiles: [],
      savedSearches: [],
      jobPostings: [],
      applicationSessions: [],
      settings: {
        localOnlyMode: false,
        aiEnabled: true,
        aiProvider: 'openai-compatible',
        aiEndpoint: 'https://ai.example.test',
        manualReviewRequired: false
      }
    });

    expect(exported.settings.aiEnabled).toBe(false);
    expect('aiEndpoint' in exported.settings).toBe(false);
  });

  it('validates import shape before use', () => {
    const preview = validateLocalDataImport({
      schemaVersion: 1,
      profiles: [
        {
          id: 'profile-1',
          contact: {},
          skills: [],
          experience: [],
          education: [],
          certifications: [],
          projects: [],
          desiredTitles: [],
          updatedAt: 'now'
        }
      ],
      savedSearches: [],
      jobPostings: [],
      applicationSessions: [],
      settings: { localOnlyMode: true }
    });

    expect(preview.valid).toBe(true);
    expect(preview.counts.profiles).toBe(1);
    expect(validateLocalDataImport({ schemaVersion: 2 }).valid).toBe(false);
    expect(validateLocalDataImport({ schemaVersion: 1 }).valid).toBe(false);
  });

  it('rejects exports with duplicate embedded record IDs', () => {
    const profile = {
      id: 'example-profile',
      contact: {},
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      projects: [],
      desiredTitles: [],
      updatedAt: '2026-10-15T00:00:00.000Z'
    };
    const exported = createLocalDataExport({
      profiles: [profile, { ...profile, contact: { fullName: 'Other person' } }],
      savedSearches: [],
      jobPostings: [],
      applicationSessions: [],
      settings: {
        localOnlyMode: true,
        aiEnabled: false,
        aiProvider: 'manual',
        manualReviewRequired: true
      }
    });
    expect(validateLocalDataImport(exported).valid).toBe(false);
  });

  it('rejects truncated exports and unexpected imported secrets', () => {
    const safe = createLocalDataExport({
      profiles: [],
      savedSearches: [],
      jobPostings: [],
      applicationSessions: [],
      settings: {
        localOnlyMode: true,
        aiEnabled: false,
        aiProvider: 'manual',
        manualReviewRequired: true
      }
    });
    const truncated: Partial<typeof safe> = { ...safe };
    delete truncated.profiles;
    const unexpectedRoot = { ...safe, apiToken: 'not allowed' };
    const secretBearingSettings = {
      ...safe,
      settings: { ...safe.settings, aiEndpoint: 'https://provider.example.test' }
    };
    expect(validateLocalDataImport(truncated).valid).toBe(false);
    expect(validateLocalDataImport(unexpectedRoot).valid).toBe(false);
    expect(validateLocalDataImport(secretBearingSettings).valid).toBe(false);
    expect(validateLocalDataImport(safe).valid).toBe(true);
  });
});
