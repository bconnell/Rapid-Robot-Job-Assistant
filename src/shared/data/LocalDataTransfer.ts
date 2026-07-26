import type { ApplicationSession } from '../models/ApplicationSession';
import type { JobPosting } from '../models/JobPosting';
import type { SavedSearch } from '../models/SavedSearch';
import type { UserProfile } from '../models/UserProfile';
import {
  areFillResultsBoundToPreview,
  areFillResultsConsistentWithPreview,
  isValidFillPreviewArray,
  isValidFillResultArray,
  normalizePageUrl
} from '../extension/PageCommandIntegrity';
import type { ExtensionSettings } from '../storage/ChromeStorageRepository';
import { isCompleteApprovedFill } from '../fill/FillApprovalRules';
import { normalizeSavedSearchUrl } from '../jobs/SavedSearchService';

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

const profileKeys = new Set([
  'id',
  'contact',
  'summary',
  'skills',
  'experience',
  'education',
  'certifications',
  'projects',
  'workAuthorization',
  'sponsorshipRequired',
  'remotePreference',
  'desiredTitles',
  'desiredSalary',
  'earliestStartDate',
  'updatedAt'
]);
const contactKeys = new Set([
  'firstName',
  'lastName',
  'fullName',
  'preferredName',
  'email',
  'phone',
  'city',
  'state',
  'zip',
  'linkedInUrl',
  'githubUrl',
  'portfolioUrl'
]);
const experienceKeys = new Set(['employer', 'title', 'startDate', 'endDate', 'highlights']);
const educationKeys = new Set(['school', 'degree', 'field', 'graduationDate']);
const projectKeys = new Set(['name', 'description', 'technologies']);
const savedSearchKeys = new Set([
  'id',
  'label',
  'url',
  'keywords',
  'location',
  'remoteOnly',
  'createdAt',
  'updatedAt',
  'lastCheckedAt',
  'lastCheckStatus',
  'enabled'
]);
const jobPostingKeys = new Set([
  'id',
  'title',
  'company',
  'location',
  'salaryText',
  'remoteStatus',
  'descriptionText',
  'requirementsText',
  'preferredQualificationsText',
  'detectedKeywords',
  'sourceUrl',
  'sourceSite',
  'dateFound',
  'status',
  'updatedAt'
]);
const applicationSessionKeys = new Set([
  'id',
  'job',
  'jobPostingId',
  'pageUrl',
  'startedAt',
  'fieldPreview',
  'fillResults',
  'manualVerificationRequired',
  'notes',
  'status',
  'submittedByUser',
  'updatedAt'
]);

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

  validateCollection(profiles, 'profiles', isValidUserProfileRecord, errors);
  validateCollection(savedSearches, 'savedSearches', isValidSavedSearchRecord, errors);
  validateCollection(jobPostings, 'jobPostings', isValidJobPostingRecord, errors);
  validateCollection(
    applicationSessions,
    'applicationSessions',
    isValidApplicationSessionRecord,
    errors
  );

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

export function isValidUserProfileRecord(value: unknown): value is UserProfile {
  if (
    !isRecord(value) ||
    !hasOnlyAllowedKeys(value, profileKeys) ||
    !isSafeId(value.id) ||
    !isRecord(value.contact) ||
    !hasOnlyAllowedKeys(value.contact, contactKeys) ||
    !everyOptionalStringValueBounded(value.contact, maxLongText)
  ) {
    return false;
  }
  return (
    optionalBoundedString(value.summary, maxLongText, true) &&
    isBoundedStringArray(value.skills, 500, 500) &&
    isProfileExperienceArray(value.experience) &&
    isProfileEducationArray(value.education) &&
    isBoundedStringArray(value.certifications, 500, 500) &&
    isProfileProjectArray(value.projects) &&
    optionalBoundedString(value.workAuthorization, maxShortText, true) &&
    (value.sponsorshipRequired === undefined || typeof value.sponsorshipRequired === 'boolean') &&
    (value.remotePreference === undefined ||
      ['remote', 'hybrid', 'onsite', 'flexible'].includes(String(value.remotePreference))) &&
    isBoundedStringArray(value.desiredTitles, 200, 500) &&
    optionalBoundedString(value.desiredSalary, maxShortText, true) &&
    optionalBoundedString(value.earliestStartDate, 100, true) &&
    isBoundedString(value.updatedAt, 100)
  );
}

export function isValidSavedSearchRecord(value: unknown): value is SavedSearch {
  if (
    !isRecord(value) ||
    !hasOnlyAllowedKeys(value, savedSearchKeys) ||
    !isSafeId(value.id) ||
    !isBoundedString(value.label, 200)
  ) {
    return false;
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeSavedSearchUrl(String(value.url ?? ''));
  } catch {
    return false;
  }

  return (
    value.url === normalizedUrl &&
    (value.keywords === undefined || isBoundedStringArray(value.keywords, 100, 200)) &&
    optionalBoundedString(value.location, 300, true) &&
    (value.remoteOnly === undefined || typeof value.remoteOnly === 'boolean') &&
    typeof value.enabled === 'boolean' &&
    isBoundedString(value.createdAt, 100) &&
    optionalBoundedString(value.updatedAt, 100) &&
    optionalBoundedString(value.lastCheckedAt, 100) &&
    optionalBoundedString(value.lastCheckStatus, maxShortText, true)
  );
}

export function isValidJobPostingRecord(value: unknown): value is JobPosting {
  if (!isRecord(value) || !hasOnlyAllowedKeys(value, jobPostingKeys)) return false;
  const normalizedSourceUrl =
    typeof value.sourceUrl === 'string' ? normalizePageUrl(value.sourceUrl) : undefined;
  return (
    isSafeId(value.id) &&
    isBoundedString(value.title, 180) &&
    optionalBoundedString(value.company, 300, true) &&
    optionalBoundedString(value.location, 500, true) &&
    optionalBoundedString(value.salaryText, 1000, true) &&
    (value.remoteStatus === undefined ||
      ['remote', 'hybrid', 'onsite', 'unknown'].includes(String(value.remoteStatus))) &&
    isBoundedString(value.descriptionText, 12000, true) &&
    optionalBoundedString(value.requirementsText, 12000, true) &&
    optionalBoundedString(value.preferredQualificationsText, 12000, true) &&
    isBoundedStringArray(value.detectedKeywords, 500, 200) &&
    Boolean(normalizedSourceUrl) &&
    value.sourceUrl === normalizedSourceUrl &&
    isBoundedString(value.sourceSite, 300) &&
    isBoundedString(value.dateFound, 100) &&
    (value.status === undefined ||
      ['saved', 'reviewing', 'applied', 'skipped'].includes(String(value.status))) &&
    optionalBoundedString(value.updatedAt, 100, true)
  );
}

export function isValidApplicationSessionRecord(value: unknown): value is ApplicationSession {
  if (
    !isRecord(value) ||
    !hasOnlyAllowedKeys(value, applicationSessionKeys) ||
    !isSafeId(value.id) ||
    typeof value.pageUrl !== 'string' ||
    normalizePageUrl(value.pageUrl) !== value.pageUrl ||
    !isBoundedString(value.startedAt, 100) ||
    !isBoundedString(value.updatedAt, 100) ||
    !isValidFillPreviewArray(value.fieldPreview) ||
    !isValidFillResultArray(value.fillResults) ||
    !areFillResultsBoundToPreview(value.fieldPreview, value.fillResults) ||
    !areFillResultsConsistentWithPreview(value.fieldPreview, value.fillResults) ||
    typeof value.manualVerificationRequired !== 'boolean' ||
    !isBoundedString(value.notes, maxLongText, true) ||
    !['draft', 'manual-verification', 'filled', 'submitted-by-user', 'skipped'].includes(
      String(value.status)
    ) ||
    typeof value.submittedByUser !== 'boolean'
  ) {
    return false;
  }

  if (value.job !== undefined && !isValidJobPostingRecord(value.job)) return false;
  if (value.jobPostingId !== undefined && !isSafeId(value.jobPostingId)) return false;
  if (value.job && value.jobPostingId && value.job.id !== value.jobPostingId) return false;

  if (value.status === 'filled' && !isCompleteApprovedFill(value.fieldPreview, value.fillResults)) {
    return false;
  }
  if (value.status === 'manual-verification' && !value.manualVerificationRequired) {
    return false;
  }
  if (
    value.manualVerificationRequired &&
    !['manual-verification', 'submitted-by-user', 'skipped'].includes(String(value.status))
  ) {
    return false;
  }
  if (value.submittedByUser !== (value.status === 'submitted-by-user')) {
    return false;
  }
  return true;
}

function isProfileExperienceArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(
      (item) =>
        isRecord(item) &&
        hasOnlyAllowedKeys(item, experienceKeys) &&
        isBoundedString(item.employer, 500) &&
        isBoundedString(item.title, 500) &&
        optionalBoundedString(item.startDate, 100, true) &&
        optionalBoundedString(item.endDate, 100, true) &&
        isBoundedStringArray(item.highlights, 500, maxLongText)
    )
  );
}

function isProfileEducationArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(
      (item) =>
        isRecord(item) &&
        hasOnlyAllowedKeys(item, educationKeys) &&
        isBoundedString(item.school, 500) &&
        optionalBoundedString(item.degree, 500, true) &&
        optionalBoundedString(item.field, 500, true) &&
        optionalBoundedString(item.graduationDate, 100, true)
    )
  );
}

function isProfileProjectArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(
      (item) =>
        isRecord(item) &&
        hasOnlyAllowedKeys(item, projectKeys) &&
        isBoundedString(item.name, 500) &&
        isBoundedString(item.description, maxLongText, true) &&
        isBoundedStringArray(item.technologies, 500, 500)
    )
  );
}

function hasOnlyAllowedKeys(value: Record<string, any>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function everyOptionalStringValueBounded(value: Record<string, any>, maxLength: number): boolean {
  return Object.values(value).every(
    (item) => item === undefined || (typeof item === 'string' && item.length <= maxLength)
  );
}

function isSafeId(value: unknown): value is string {
  return isBoundedString(value, 200);
}

function optionalBoundedString(value: unknown, maxLength: number, allowEmpty = false): boolean {
  return value === undefined || isBoundedString(value, maxLength, allowEmpty);
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

function isBoundedStringArray(
  value: unknown,
  maxItems: number,
  maxItemLength: number
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isBoundedString(item, maxItemLength))
  );
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
