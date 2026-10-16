import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  areFillResultsBoundToPreview,
  areFillResultsConsistentWithPreview,
  canAccessSessionPageFromSender,
  isValidFillPreviewArray,
  isVerifiedFillResponse,
  normalizePageUrl
} from '../../src/shared/extension/PageCommandIntegrity';
import { validateLocalDataImport } from '../../src/shared/data/LocalDataTransfer';
import type { FillPreviewItem } from '../../src/shared/models/FieldMapping';

function preview(selector = '#email'): FillPreviewItem {
  return {
    candidate: {
      selector,
      tagName: 'input',
      inputType: 'email',
      options: [],
      required: true,
      visible: true,
      stableSelector: true
    },
    kind: 'email',
    confidence: 0.96,
    sensitive: false,
    fillable: true,
    requiresDirectReview: false,
    value: 'alex@example.test',
    approved: true,
    status: 'approved'
  };
}

function validProfile() {
  return {
    id: 'profile-1',
    contact: { fullName: 'Alex Morgan', email: 'alex@example.test' },
    skills: ['TypeScript'],
    experience: [
      {
        employer: 'Example Company',
        title: 'Developer',
        highlights: ['Built reliable software.']
      }
    ],
    education: [{ school: 'Example University' }],
    certifications: [],
    projects: [
      {
        name: 'Example Project',
        description: 'A local test project.',
        technologies: ['TypeScript']
      }
    ],
    desiredTitles: ['Software Developer'],
    updatedAt: '2026-07-26T00:00:00.000Z'
  };
}

function validJob() {
  return {
    id: 'job-1',
    title: 'Software Developer',
    descriptionText: 'Build and test software for candidates.',
    detectedKeywords: ['TypeScript'],
    sourceUrl: 'https://jobs.example.test/roles/1',
    sourceSite: 'jobs.example.test',
    dateFound: '2026-07-26T00:00:00.000Z',
    status: 'saved'
  };
}

function importEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    profiles: [],
    savedSearches: [],
    jobPostings: [],
    applicationSessions: [],
    settings: {},
    ...overrides
  };
}

describe('session lifecycle and import integrity', () => {
  it('binds content-script session reads and writes to the exact sending page', () => {
    const page = 'https://jobs.example.test/apply/1';
    expect(canAccessSessionPageFromSender({ tab: { url: page } }, page)).toBe(true);
    expect(
      canAccessSessionPageFromSender(
        { tab: { url: 'https://jobs.example.test/apply/other' } },
        page
      )
    ).toBe(false);
    expect(
      canAccessSessionPageFromSender(
        { tab: { url: 'https://other.example.test/apply/1' }, url: page },
        page
      )
    ).toBe(false);
    expect(canAccessSessionPageFromSender({ tab: {} }, page)).toBe(false);
    expect(canAccessSessionPageFromSender({}, page)).toBe(true);
  });

  it('rejects unverified fill responses and results for unapproved selectors', () => {
    const pageUrl = 'https://jobs.example.test/apply/1';
    const approved = preview();
    const valid = {
      pageUrl,
      pageMatched: true,
      verification: { detected: false, reasons: [] },
      results: [{ selector: '#email', ok: true, message: 'Filled' }]
    };
    expect(isVerifiedFillResponse(valid, pageUrl, [approved])).toBe(true);
    expect(isVerifiedFillResponse({ ...valid, verification: undefined }, pageUrl, [approved])).toBe(
      false
    );
    expect(
      isVerifiedFillResponse({ ...valid, pageUrl: 'https://jobs.example.test/apply/2' },
        pageUrl, [approved])
    ).toBe(false);
    expect(
      isVerifiedFillResponse(valid, pageUrl, [{ ...approved, approved: false }])
    ).toBe(false);
    expect(
      isVerifiedFillResponse(
        { ...valid, results: [{ selector: '#unapproved', ok: true, message: 'Filled' }] },
        pageUrl,
        [approved]
      )
    ).toBe(false);
  });

  it('rejects credential-bearing page URLs and binds every result to a preview selector', () => {
    expect(normalizePageUrl(' https://jobs.example.test/apply/1 ')).toBe(
      'https://jobs.example.test/apply/1'
    );
    expect(normalizePageUrl('https://user:secret@jobs.example.test/apply/1')).toBeUndefined();
    expect(
      areFillResultsBoundToPreview(
        [preview()],
        [{ selector: '#email', ok: true, message: 'Filled' }]
      )
    ).toBe(true);
    expect(
      areFillResultsBoundToPreview(
        [preview()],
        [{ selector: '#other', ok: true, message: 'Wrong field' }]
      )
    ).toBe(false);
    expect(
      areFillResultsConsistentWithPreview(
        [{ ...preview(), status: 'filled' }],
        [{ selector: '#email', ok: true, message: 'Filled' }]
      )
    ).toBe(true);
    expect(
      areFillResultsConsistentWithPreview(
        [preview()],
        [{ selector: '#email', ok: true, message: 'Filled' }]
      )
    ).toBe(false);
  });

  it('rejects unsupported preview properties instead of carrying them into storage', () => {
    expect(
      isValidFillPreviewArray([
        {
          ...preview(),
          unexpectedPrivateField: 'reject me'
        }
      ])
    ).toBe(false);
    expect(
      isValidFillPreviewArray([
        {
          ...preview(),
          candidate: {
            ...preview().candidate,
            unexpectedCandidateField: 'reject me'
          }
        }
      ])
    ).toBe(false);
  });

  it('rejects saved-search imports that retain credentials or noncanonical tracking data', () => {
    const base = {
      id: 'search-1',
      label: 'Jobs',
      keywords: ['TypeScript'],
      createdAt: '2026-07-26T00:00:00.000Z',
      enabled: true
    };
    expect(
      validateLocalDataImport(
        importEnvelope({
          savedSearches: [{ ...base, url: 'https://user:secret@jobs.example.test/search' }]
        })
      ).valid
    ).toBe(false);
    expect(
      validateLocalDataImport(
        importEnvelope({
          savedSearches: [
            {
              ...base,
              url: 'https://jobs.example.test/search?utm_source=test#results'
            }
          ]
        })
      ).valid
    ).toBe(false);
  });

  it('rejects malformed structured profiles and unsupported job enums', () => {
    expect(
      validateLocalDataImport(
        importEnvelope({
          profiles: [
            {
              ...validProfile(),
              experience: [
                {
                  employer: 'Example Company',
                  title: 'Developer',
                  highlights: 'not-an-array'
                }
              ]
            }
          ]
        })
      ).valid
    ).toBe(false);
    expect(
      validateLocalDataImport(
        importEnvelope({
          jobPostings: [{ ...validJob(), status: 'invented' }]
        })
      ).valid
    ).toBe(false);
  });

  it('rejects unknown stored fields while allowing empty optional profile values', () => {
    expect(
      validateLocalDataImport(
        importEnvelope({
          profiles: [{ ...validProfile(), summary: '', unexpectedPrivateField: 'reject me' }]
        })
      ).valid
    ).toBe(false);
    expect(
      validateLocalDataImport(
        importEnvelope({ profiles: [{ ...validProfile(), summary: '', desiredSalary: '' }] })
      ).valid
    ).toBe(true);
  });

  it('rejects session results outside the preview and inconsistent job references', () => {
    const session = {
      id: 'session-1',
      pageUrl: 'https://jobs.example.test/apply/1',
      startedAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
      fieldPreview: [preview()],
      fillResults: [{ selector: '#other', ok: true, message: 'Wrong field' }],
      manualVerificationRequired: false,
      notes: '',
      status: 'draft',
      submittedByUser: false,
      job: validJob(),
      jobPostingId: 'different-job'
    };
    expect(validateLocalDataImport(importEnvelope({ applicationSessions: [session] })).valid).toBe(
      false
    );
  });

  it('keeps restored side-panel history read-only until fresh field analysis', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/sidepanel/SidePanelApp.tsx'), 'utf8');
    expect(source).toContain('setSession(existing);');
    expect(source).toContain('const freshPreview = fieldSummary ? preview : [];');
    expect(source).toMatch(/disabled=\{!previewInteractive \|\| item\.status === 'manual-only'\}/);
    expect(source).toContain('patch.fillResults ?? session?.fillResults ?? fillResults');
    expect(source).toContain('isValidApplicationSessionRecord(next)');
    expect(source).toContain('fillResults.length > 0');
  });

  it('blocks invalid stored records from options loading and local-data export', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/options/OptionsApp.tsx'), 'utf8');
    expect(source).toContain('searches.filter(isValidSavedSearchRecord)');
    expect(source).toContain('applicationSessions.every(isValidApplicationSessionRecord)');
    expect(source).toContain('Export was stopped to avoid copying it.');
  });

  it('snapshots queued in-page writes and disables immediate repeated filling', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/content/inPageAssistant/InPageAssistantController.ts'),
      'utf8'
    );
    expect(source).not.toContain('sessionWriteChain = Promise.resolve();\n  return { closed');
    expect(source).toContain('fieldPreview: snapshotPreview(state.preview)');
    expect(source).toContain('state.preview = clearApprovals(state.preview);');
    expect(source).toContain("const editorDisabled = busy || item.status === 'manual-only'");
  });
});
