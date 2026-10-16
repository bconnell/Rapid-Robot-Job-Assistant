import { describe, expect, it } from 'vitest';
import { createLocalTailoringSuggestions } from '../../src/shared/ai/TailoringService';
import type { JobPosting } from '../../src/shared/models/JobPosting';
import type { UserProfile } from '../../src/shared/models/UserProfile';

const job: JobPosting = {
  id: 'fake-job',
  title: 'TypeScript Developer',
  descriptionText: 'Experience with TypeScript and Python is helpful.',
  detectedKeywords: ['TypeScript', 'Python'],
  sourceUrl: 'https://jobs.example.test/role/1',
  sourceSite: 'jobs.example.test',
  dateFound: '2026-10-15T00:00:00.000Z'
};

const profile: UserProfile = {
  id: 'fake-profile',
  contact: { fullName: 'Example Person' },
  skills: ['TypeScript'],
  experience: [],
  education: [],
  certifications: [],
  projects: [],
  desiredTitles: ['Developer'],
  updatedAt: '2026-10-15T00:00:00.000Z'
};

describe('review-first local job wording', () => {
  it('suggests only supported skill matches as copyable wording', () => {
    const suggestions = createLocalTailoringSuggestions(job, profile);
    const low = suggestions.filter(
      (item) => item.riskLevel === 'low' && !item.truthfulnessWarning
    );
    expect(low).toHaveLength(1);
    expect(low[0].suggestedText).toContain('TypeScript');
    expect(low[0].suggestedText).not.toContain('Python');
  });

  it('warns about missing qualifications instead of claiming them', () => {
    const suggestions = createLocalTailoringSuggestions(job, profile);
    const warning = suggestions.find((item) => item.matchedJobKeywords.includes('python'));
    expect(warning?.riskLevel).toBe('medium');
    expect(warning?.truthfulnessWarning).toMatch(/unsupported/i);
  });

  it('does not invent positive claims without matching profile skills', () => {
    const suggestions = createLocalTailoringSuggestions(job, { ...profile, skills: [] });
    expect(suggestions.filter((item) => item.riskLevel === 'low')).toEqual([]);
  });
});
