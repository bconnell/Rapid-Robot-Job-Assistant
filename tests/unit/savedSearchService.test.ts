import { describe, expect, it } from 'vitest';
import {
  createSavedSearch,
  markSavedSearchChecked
} from '../../src/shared/jobs/SavedSearchService';

describe('SavedSearchService', () => {
  it('creates and marks conservative saved searches', () => {
    const search = createSavedSearch({
      label: 'Frontend remote',
      url: 'https://jobs.example.test/search?q=frontend',
      keywords: ['React', ' TypeScript '],
      location: 'Remote',
      remoteOnly: true
    });
    const checked = markSavedSearchChecked(search);

    expect(search.keywords).toEqual(['React', 'TypeScript']);
    expect(search.remoteOnly).toBe(true);
    expect(checked.lastCheckedAt).toBeTruthy();
  });

  it('rejects invalid search URLs', () => {
    expect(() => createSavedSearch({ label: 'Bad', url: 'not a url' })).toThrow();
  });
});
