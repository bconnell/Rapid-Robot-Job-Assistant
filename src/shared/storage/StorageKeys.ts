export const STORAGE_KEYS = {
  settings: 'rrja.settings',
  activeProfileId: 'rrja.activeProfileId'
} as const;

export const INDEXED_DB = {
  name: 'rapid-robot-job-assistant',
  version: 1,
  stores: [
    'profiles',
    'resumeDocuments',
    'jobPostings',
    'applicationSessions',
    'fieldMappings',
    'savedSearches',
    'tailoringSuggestions'
  ]
} as const;
