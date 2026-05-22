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
  });
});
