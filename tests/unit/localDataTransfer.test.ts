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

    expect(exported.schemaVersion).toBe(2);
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

  it('rejects missing seven-store collections in version two but accepts legacy version one', () => {
    const data = createLocalDataExport({
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
    const truncated = { ...data };
    delete truncated.resumeDocuments;
    expect(validateLocalDataImport(truncated).valid).toBe(false);
    const legacy = { ...truncated, schemaVersion: 1 };
    delete legacy.fieldMappings;
    delete legacy.tailoringSuggestions;
    expect(validateLocalDataImport(legacy).valid).toBe(true);
    expect(validateLocalDataImport(data).valid).toBe(true);
  });

  it('rejects unsafe records in added backup stores', () => {
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
    expect(
      validateLocalDataImport({
        ...safe,
        resumeDocuments: [{
          id: 'resume-1',
          sourceType: 'pasted-text',
          text: 'Synthetic resume',
          importedAt: '2026-10-15',
          warnings: [],
          unexpectedCredential: 'reject'
        }]
      }).valid
    ).toBe(false);
    expect(
      validateLocalDataImport({
        ...safe,
        tailoringSuggestions: [{
          id: 'suggestion-1',
          originalText: '',
          suggestedText: 'Claim an unsupported degree',
          reason: 'Not backed by the profile',
          matchedJobKeywords: [],
          riskLevel: 'invented',
          status: 'suggested'
        }]
      }).valid
    ).toBe(false);
    expect(
      validateLocalDataImport({
        ...safe,
        fieldMappings: [{
          id: 'mapping-1',
          candidate: { selector: '#fake', tagName: 'input', options: [], required: true, visible: true },
          kind: 'email',
          confidence: 0.9,
          sensitive: false,
          fillable: true,
          requiresDirectReview: false,
          unknownField: 'reject'
        }]
      }).valid
    ).toBe(false);
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
