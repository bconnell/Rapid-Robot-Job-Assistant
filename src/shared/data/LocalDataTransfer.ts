import type { ApplicationSession } from '../models/ApplicationSession';
import type { JobPosting } from '../models/JobPosting';
import type { SavedSearch } from '../models/SavedSearch';
import type { UserProfile } from '../models/UserProfile';
import type { ExtensionSettings } from '../storage/ChromeStorageRepository';

export interface LocalDataExport {
  schemaVersion: 1;
  exportedAt: string;
  profiles: UserProfile[];
  savedSearches: SavedSearch[];
  jobPostings: JobPosting[];
  applicationSessions: ApplicationSession[];
  settings: Omit<ExtensionSettings, 'aiEndpoint'>;
}

interface LocalDataExportInput extends Omit<LocalDataExport, 'schemaVersion' | 'exportedAt' | 'settings'> {
  settings: ExtensionSettings;
}

export interface ImportPreview {
  valid: boolean;
  errors: string[];
  counts: {
    profiles: number;
    savedSearches: number;
    jobPostings: number;
    applicationSessions: number;
  };
  data?: LocalDataExport;
}

export function createLocalDataExport(input: LocalDataExportInput): LocalDataExport {
  const safeSettings: Omit<ExtensionSettings, 'aiEndpoint'> = {
    localOnlyMode: input.settings.localOnlyMode,
    aiEnabled: false,
    aiProvider: input.settings.aiProvider,
    manualReviewRequired: true
  };
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profiles: input.profiles,
    savedSearches: input.savedSearches,
    jobPostings: input.jobPostings,
    applicationSessions: input.applicationSessions,
    settings: safeSettings
  };
}

export function validateLocalDataImport(value: unknown): ImportPreview {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return emptyPreview(['Import file must contain a JSON object.']);
  }
  if (value.schemaVersion !== 1) errors.push('Unsupported or missing schemaVersion.');

  const profiles = readArray(value.profiles, 'profiles', errors);
  const savedSearches = readArray(value.savedSearches, 'savedSearches', errors);
  const jobPostings = readArray(value.jobPostings, 'jobPostings', errors);
  const applicationSessions = readArray(value.applicationSessions, 'applicationSessions', errors);
  const settings = isRecord(value.settings) ? value.settings : {};

  for (const item of [...profiles, ...savedSearches, ...jobPostings, ...applicationSessions]) {
    if (!isRecord(item) || typeof item.id !== 'string') {
      errors.push('Every imported record must have a string id.');
      break;
    }
  }

  const data = errors.length
    ? undefined
    : ({
        schemaVersion: 1,
        exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
        profiles: profiles as UserProfile[],
        savedSearches: savedSearches as SavedSearch[],
        jobPostings: jobPostings as JobPosting[],
        applicationSessions: applicationSessions as ApplicationSession[],
        settings: {
          localOnlyMode: settings.localOnlyMode !== false,
          aiEnabled: false,
          aiProvider:
            settings.aiProvider === 'openai-compatible' || settings.aiProvider === 'ollama'
              ? settings.aiProvider
              : 'manual',
          manualReviewRequired: true
        }
      } satisfies LocalDataExport);

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      profiles: profiles.length,
      savedSearches: savedSearches.length,
      jobPostings: jobPostings.length,
      applicationSessions: applicationSessions.length
    },
    data
  };
}

function readArray(value: unknown, name: string, errors: string[]): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${name} must be an array.`);
    return [];
  }
  return value;
}

function emptyPreview(errors: string[]): ImportPreview {
  return {
    valid: false,
    errors,
    counts: { profiles: 0, savedSearches: 0, jobPostings: 0, applicationSessions: 0 }
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
