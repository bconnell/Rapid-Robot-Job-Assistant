import { describe, expect, it } from 'vitest';
import { filterSavedJobs, filterSavedSessions, orderSavedJobs, orderSavedSessions } from '../../src/shared/jobs/JobHistoryOrdering';
import type { JobPosting } from '../../src/shared/models/JobPosting';
import type { ApplicationSession } from '../../src/shared/models/ApplicationSession';

const job: JobPosting = {
  id: 'old',
  title: 'Developer',
  descriptionText: 'Synthetic job.',
  detectedKeywords: [],
  sourceUrl: 'https://jobs.example.test/role/1',
  sourceSite: 'jobs.example.test',
  dateFound: '2026-10-13T00:00:00.000Z'
};
const session: ApplicationSession = {
  id: 'old-session',
  pageUrl: 'https://jobs.example.test/apply/1',
  startedAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
  fieldPreview: [],
  fillResults: [],
  manualVerificationRequired: false,
  notes: '',
  status: 'draft',
  submittedByUser: false
};

describe('local history ordering', () => {
  it('puts latest jobs first without mutating the repository result', () => {
    const original = [job, { ...job, id: 'new', updatedAt: '2026-10-15T00:00:00.000Z' }];
    expect(orderSavedJobs(original).map((item) => item.id)).toEqual(['new', 'old']);
    expect(original[0].id).toBe('old');
  });

  it('filters saved postings by company or status without modifying source', () => {
    const postings: JobPosting[] = [
      { ...job, company: 'Example Company' },
      { ...job, id: 'remote-role', company: 'Remote Systems', remoteStatus: 'remote' }
    ];
    expect(filterSavedJobs(postings, ' REMOTE ')).toHaveLength(1);
    expect(filterSavedJobs(postings, 'example')).toHaveLength(1);
    expect(postings).toHaveLength(2);
  });

  it('filters local session history by notes or user-marked status', () => {
    const sessions: ApplicationSession[] = [
      session,
      { ...session, id: 'submitted', status: 'submitted-by-user', submittedByUser: true,
        notes: 'Follow-up requested' }
    ];
    expect(filterSavedSessions(sessions, 'follow-up')).toHaveLength(1);
    expect(filterSavedSessions(sessions, 'SUBMITTED')).toHaveLength(1);
    expect(filterSavedSessions(sessions, 'not-present')).toHaveLength(0);
  });

  it('puts newest application sessions first', () => {
    const newer = { ...session, id: 'new-session', updatedAt: '2026-10-15T00:00:00.000Z' };
    expect(orderSavedSessions([session, newer]).map((item) => item.id)).toEqual([
      'new-session',
      'old-session'
    ]);
  });
});
