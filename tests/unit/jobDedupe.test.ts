import { describe, expect, it } from 'vitest';
import { dedupeJobs } from '../../src/shared/jobs/JobDedupeService';
import type { JobPosting } from '../../src/shared/models/JobPosting';

const baseJob: JobPosting = {
  id: '1',
  title: 'Frontend Engineer',
  company: 'Example Robotics',
  location: 'Remote',
  descriptionText: 'React and TypeScript',
  detectedKeywords: ['react', 'typescript'],
  sourceUrl: 'https://jobs.example.test/role?utm_source=newsletter',
  sourceSite: 'jobs.example.test',
  dateFound: '2026-01-01T00:00:00.000Z'
};

describe('dedupeJobs', () => {
  it('deduplicates by normalized URL and semantic job details', () => {
    const jobs = dedupeJobs([
      baseJob,
      { ...baseJob, id: '2', sourceUrl: 'https://jobs.example.test/role?utm_campaign=test' }
    ]);

    expect(jobs).toHaveLength(1);
  });
});
