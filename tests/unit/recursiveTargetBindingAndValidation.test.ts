import { describe, expect, it } from 'vitest';
import {
  isSamePageUrl,
  readFillApprovedFieldsRequest
} from '../../src/shared/extension/PageCommandIntegrity';
import { isCompleteApprovedFill } from '../../src/shared/fill/FillApprovalRules';
import { matchJobToProfile } from '../../src/shared/jobs/JobMatchService';
import { isMeaningfulJobPosting } from '../../src/shared/jobs/JobPostingValidation';
import type { FieldMapping, FillPreviewItem } from '../../src/shared/models/FieldMapping';
import type { JobPosting } from '../../src/shared/models/JobPosting';
import type { UserProfile } from '../../src/shared/models/UserProfile';
import { resolveProfileValue } from '../../src/shared/fill/ProfileValueResolver';
import { validateLocalDataImport } from '../../src/shared/data/LocalDataTransfer';
import { extractJobPostingFromDocument } from '../../src/content/jobPageExtractor';

function preview(selector = '#email'): FillPreviewItem {
  return {
    candidate: {
      selector,
      tagName: 'input',
      inputType: 'email',
      id: selector.slice(1),
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

const profile: UserProfile = {
  id: 'profile-1',
  contact: { fullName: 'Alex Jordan Morgan', email: 'alex@example.test' },
  skills: ['C', 'API Design', 'TypeScript', 'React'],
  experience: [
    {
      title: 'Earlier Developer',
      employer: 'Earlier Company',
      startDate: '2018',
      endDate: '2020',
      highlights: []
    },
    {
      title: 'Current Developer',
      employer: 'Current Company',
      startDate: '2021',
      endDate: 'Present',
      highlights: []
    }
  ],
  education: [
    { school: 'Example College', degree: 'Associate of Science' },
    { school: 'Example University', degree: 'Master of Science' }
  ],
  certifications: [],
  projects: [],
  desiredTitles: [],
  updatedAt: '2026-07-26T00:00:00.000Z'
};

describe('recursive target binding and record validation', () => {
  it('accepts only bounded page-bound fill requests with unique selectors', () => {
    const request = readFillApprovedFieldsRequest({
      pageUrl: 'https://jobs.example.test/apply/123',
      preview: [preview()]
    });
    expect(request?.pageUrl).toBe('https://jobs.example.test/apply/123');
    expect(
      readFillApprovedFieldsRequest({
        pageUrl: 'https://jobs.example.test/apply/123',
        preview: [preview(), preview()]
      })
    ).toBeUndefined();
    expect(isSamePageUrl(request?.pageUrl ?? '', 'https://jobs.example.test/apply/124')).toBe(
      false
    );
  });

  it('requires a successful result for every approved selector', () => {
    expect(
      isCompleteApprovedFill(
        [preview()],
        [{ selector: '#email', ok: true, message: 'Filled approved field.' }]
      )
    ).toBe(true);
    expect(
      isCompleteApprovedFill(
        [preview()],
        [{ selector: '#email', ok: false, message: 'The page rejected the value.' }]
      )
    ).toBe(false);
  });

  it('keeps job match scores bounded and avoids substring skill matches', () => {
    const job = {
      id: 'job-1',
      title: 'Capital Markets Analyst',
      descriptionText:
        'Analyze capital markets and financial reports. Responsibilities include testing reports.',
      detectedKeywords: ['testing'],
      sourceUrl: 'https://jobs.example.test/1',
      sourceSite: 'jobs.example.test',
      dateFound: '2026-07-26T00:00:00.000Z'
    } satisfies JobPosting;

    const match = matchJobToProfile(job, profile);
    expect(match.matchedSkills).not.toContain('C');
    expect(match.score).toBeLessThanOrEqual(100);
  });

  it('resolves multi-part names, current employer, experience years, and highest degree', () => {
    const mapping: FieldMapping = {
      candidate: preview().candidate,
      kind: 'email',
      confidence: 0.96,
      sensitive: false,
      fillable: true,
      requiresDirectReview: false
    };

    expect(resolveProfileValue({ ...mapping, kind: 'firstName' }, profile).value).toBe('Alex');
    expect(resolveProfileValue({ ...mapping, kind: 'lastName' }, profile).value).toBe('Morgan');
    expect(resolveProfileValue({ ...mapping, kind: 'currentEmployer' }, profile).value).toBe(
      'Current Company'
    );
    expect(resolveProfileValue({ ...mapping, kind: 'highestDegree' }, profile).value).toBe(
      'Master of Science'
    );
    expect(resolveProfileValue({ ...mapping, kind: 'yearsExperience' }, profile).value).toMatch(
      /years?/
    );
  });

  it('rejects generic pages and structurally invalid local-data imports', () => {
    const generic = {
      id: 'job-1',
      title: 'Accessibility Statement',
      company: 'Example Company',
      location: 'Remote',
      descriptionText: 'Accessibility information '.repeat(30),
      detectedKeywords: ['accessibility', 'remote'],
      sourceUrl: 'https://example.test/accessibility',
      sourceSite: 'example.test',
      dateFound: '2026-07-26T00:00:00.000Z'
    } satisfies JobPosting;
    expect(isMeaningfulJobPosting(generic)).toBe(false);

    expect(
      validateLocalDataImport({
        schemaVersion: 1,
        profiles: [{ id: 'duplicate' }, { id: 'duplicate' }],
        savedSearches: [],
        jobPostings: [],
        applicationSessions: [],
        settings: {}
      }).valid
    ).toBe(false);
  });

  it('stops requirements text at the next section heading', () => {
    document.body.innerHTML = `
      <main>
        <h1>Software Engineer</h1>
        <p>Example Company</p>
        <section class="job-description">
          Responsibilities: Build and test reliable application features for candidates.
          Requirements: TypeScript and testing experience are required.
          Benefits: Medical coverage and paid time off.
        </section>
      </main>`;

    const job = extractJobPostingFromDocument(document);
    expect(job.requirementsText).toContain('TypeScript');
    expect(job.requirementsText).not.toContain('Medical coverage');
  });

  it('reports less than one year without rounding down to zero years', () => {
    const shortProfile: UserProfile = {
      ...profile,
      experience: [
        {
          title: 'Developer',
          employer: 'Example Company',
          startDate: '2026-01-01',
          endDate: '2026-07-01',
          highlights: []
        }
      ]
    };
    const mapping: FieldMapping = {
      candidate: preview().candidate,
      kind: 'yearsExperience',
      confidence: 0.96,
      sensitive: false,
      fillable: true,
      requiresDirectReview: false
    };
    expect(resolveProfileValue(mapping, shortProfile).value).toBe('Less than 1 year');
  });
});
