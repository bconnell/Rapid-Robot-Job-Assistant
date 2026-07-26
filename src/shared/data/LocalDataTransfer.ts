import type { ApplicationSession } from '../models/ApplicationSession';
import type { JobPosting } from '../models/JobPosting';
import type { SavedSearch } from '../models/SavedSearch';
import type { UserProfile } from '../models/UserProfile';
import {
  isValidFillPreviewArray,
  isValidFillResultArray,
  normalizePageUrl
} from '../extension/PageCommandIntegrity';
import type { ExtensionSettings } from '../storage/ChromeStorageRepository';
import { isCompleteApprovedFill } from '../fill/FillApprovalRules';

export interface LocalDataExport {
  schemaVersion: 1;
  exportedAt: string;
  profiles: UserProfile[];
  savedSearches: SavedSearch[];
  jobPostings: JobPosting[];
  applicationSessions: ApplicationSession[];
  settings: Omit<ExtensionSettings, 'aiEndpoint'>;
}

interface LocalDataExportInput extends Omit<
  LocalDataExport,
  'schemaVersion' | 'exportedAt' | 'settings'
> {
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

const maxRecordsPerCollection = 5000;
const maxShortText = 4000;
const maxLongText = 20000;

export function createLocalDataExport(input: LocalDataExportInput): LocalDataExport {
  const safeSettings: Omit<ExtensionSettings, 'aiEndpoint'> = {
    localOnlyMode: true,
    aiEnabled: false,
    aiProvider: 'manual',
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

  validateCollection(profiles, 'profiles', isUserProfile, errors);
  validateCollection(savedSearches, 'savedSearches', isSavedSearch, errors);
  validateCollection(jobPostings, 'jobPostings', isJobPosting, errors);
  validateCollection(applicationSessions, 'applicationSessions', isApplicationSession, errors);

  if (value.settings !== undefined && !isRecord(value.settings)) {
    errors.push('settings must be an object.');
  }

  const data = errors.length
    ? undefined
    : ({
        schemaVersion: 1,
        exportedAt:
          typeof value.exportedAt === 'string' && value.exportedAt.length <= 100
            ? value.exportedAt
            : new Date().toISOString(),
        profiles: profiles as UserProfile[],
        savedSearches: savedSearches as SavedSearch[],
        jobPostings: jobPostings as JobPosting[],
        applicationSessions: applicationSessions as ApplicationSession[],
        settings: {
          localOnlyMode: true,
          aiEnabled: false,
          aiProvider: 'manual',
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
  if (value.length > maxRecordsPerCollection) {
    errors.push(`${name} contains too many records.`);
    return [];
  }
  return value;
}

function validateCollection(
  values: unknown[],
  name: string,
  validator: (value: unknown) => boolean,
  errors: string[]
): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (!validator(value)) {
      errors.push(`${name} contains an invalid record.`);
      return;
    }
    const id = (value as { id: string }).id;
    if (ids.has(id)) {
      errors.push(`${name} contains duplicate id "${id}".`);
      return;
    }
    ids.add(id);
  }
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value) || !isSafeId(value.id) || !isRecord(value.contact)) return false;
  return (
    isStringArray(value.skills) &&
    isRecordArray(value.experience) &&
    isRecordArray(value.education) &&
    isStringArray(value.certifications) &&
    isRecordArray(value.projects) &&
    isStringArray(value.desiredTitles) &&
    isBoundedString(value.updatedAt, 100) &&
    everyRecordStringValuesBounded(value.contact)
  );
}

function isSavedSearch(value: unknown): value is SavedSearch {
  return (
    isRecord(value) &&
    isSafeId(value.id) &&
    isBoundedString(value.label, maxShortText) &&
    typeof value.url === 'string' &&
    Boolean(normalizePageUrl(value.url)) &&
    isBoundedString(value.createdAt, 100) &&
    typeof value.enabled === 'boolean' &&
    (value.keywords === undefined || isStringArray(value.keywords))
  );
}

function isJobPosting(value: unknown): value is JobPosting {
  return (
    isRecord(value) &&
    isSafeId(value.id) &&
    isBoundedString(value.title, 180) &&
    isBoundedString(value.descriptionText, 12000, true) &&
    typeof value.sourceUrl === 'string' &&
    Boolean(normalizePageUrl(value.sourceUrl)) &&
    isBoundedString(value.sourceSite, 300) &&
    isBoundedString(value.dateFound, 100) &&
    isStringArray(value.detectedKeywords)
  );
}

function isApplicationSession(value: unknown): value is ApplicationSession {
  if (
    !isRecord(value) ||
    !isSafeId(value.id) ||
    typeof value.pageUrl !== 'string' ||
    !normalizePageUrl(value.pageUrl) ||
    !isBoundedString(value.startedAt, 100) ||
    !isBoundedString(value.updatedAt, 100) ||
    !isValidFillPreviewArray(value.fieldPreview) ||
    !isValidFillResultArray(value.fillResults) ||
    typeof value.manualVerificationRequired !== 'boolean' ||
    !isBoundedString(value.notes, maxLongText, true) ||
    !['draft', 'manual-verification', 'filled', 'submitted-by-user', 'skipped'].includes(
      String(value.status)
    ) ||
    typeof value.submittedByUser !== 'boolean'
  ) {
    return false;
  }

  if (value.status === 'filled' && !isCompleteApprovedFill(value.fieldPreview, value.fillResults)) {
    return false;
  }
  if (value.submittedByUser !== (value.status === 'submitted-by-user')) {
    return false;
  }
  return true;
}

function isSafeId(value: unknown): value is string {
  return isBoundedString(value, 200);
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 5000 &&
    value.every((item) => typeof item === 'string' && item.length <= maxLongText)
  );
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.length <= 5000 &&
    value.every((item) => isRecord(item) && everyRecordStringValuesBounded(item))
  );
}

function everyRecordStringValuesBounded(value: Record<string, any>): boolean {
  return Object.values(value).every((item) => {
    if (typeof item === 'string') return item.length <= maxLongText;
    if (Array.isArray(item)) {
      return (
        item.length <= 5000 &&
        item.every((entry) => {
          if (typeof entry === 'string') return entry.length <= maxLongText;
          return isRecord(entry) && everyRecordStringValuesBounded(entry);
        })
      );
    }
    if (isRecord(item)) return everyRecordStringValuesBounded(item);
    return (
      item === undefined || item === null || typeof item === 'boolean' || typeof item === 'number'
    );
  });
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
