import type { FieldMappingKind, FillPreviewItem, FillResult } from '../models/FieldMapping';

export interface FillApprovedFieldsRequest {
  pageUrl: string;
  preview: FillPreviewItem[];
}

export const maxFillItems = 500;
const maxSelectorLength = 2000;
const maxValueLength = 20000;
const maxMessageLength = 4000;
const maxMetadataLength = 4000;
const maxOptionLength = 1000;
const maxOptions = 500;

const fieldMappingKinds = new Set<FieldMappingKind>([
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'linkedInUrl',
  'githubUrl',
  'portfolioUrl',
  'resumeUpload',
  'coverLetterUpload',
  'workAuthorization',
  'sponsorship',
  'desiredSalary',
  'earliestStartDate',
  'currentEmployer',
  'education',
  'workExperience',
  'yearsExperience',
  'highestDegree',
  'availability',
  'willingToRelocate',
  'remotePreference',
  'voluntaryDemographic',
  'disability',
  'veteranStatus',
  'gender',
  'race',
  'ethnicity',
  'pronouns',
  'unknown'
]);

const previewStatuses = new Set([
  'pending',
  'approved',
  'rejected',
  'filled',
  'failed',
  'manual-only'
]);

const controlFamilies = new Set([
  'native-input',
  'native-textarea',
  'native-select',
  'native-multi-select',
  'radio-group',
  'checkbox-group',
  'file-upload',
  'aria-combobox',
  'custom-select',
  'unknown-widget'
]);

const candidateSources = new Set(['native-control', 'aria-widget', 'grouped-control']);

export function normalizePageUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function isSamePageUrl(expected: string, actual: string): boolean {
  const expectedUrl = normalizePageUrl(expected);
  const actualUrl = normalizePageUrl(actual);
  return Boolean(expectedUrl && actualUrl && expectedUrl === actualUrl);
}

export function readFillApprovedFieldsRequest(
  value: unknown
): FillApprovedFieldsRequest | undefined {
  if (!isRecord(value)) return undefined;
  const pageUrl = typeof value.pageUrl === 'string' ? normalizePageUrl(value.pageUrl) : undefined;
  if (!pageUrl || !isValidFillPreviewArray(value.preview)) return undefined;
  return { pageUrl, preview: value.preview };
}

export function isValidFillPreviewArray(value: unknown): value is FillPreviewItem[] {
  return (
    Array.isArray(value) &&
    value.length <= maxFillItems &&
    value.every(isValidFillPreviewItem) &&
    hasUniqueSelectors(value)
  );
}

export function isValidFillResultArray(value: unknown): value is FillResult[] {
  return (
    Array.isArray(value) &&
    value.length <= maxFillItems &&
    value.every(
      (item) =>
        isRecord(item) &&
        isBoundedString(item.selector, maxSelectorLength) &&
        typeof item.ok === 'boolean' &&
        isBoundedString(item.message, maxMessageLength, true)
    ) &&
    new Set(value.map((item) => item.selector)).size === value.length
  );
}

function isValidFillPreviewItem(value: unknown): value is FillPreviewItem {
  if (!isRecord(value) || !isRecord(value.candidate)) return false;
  const candidate = value.candidate;
  return (
    isBoundedString(candidate.selector, maxSelectorLength) &&
    isBoundedString(candidate.tagName, 40) &&
    Array.isArray(candidate.options) &&
    candidate.options.length <= maxOptions &&
    candidate.options.every((option) => isBoundedString(option, maxOptionLength, true)) &&
    (candidate.optionValues === undefined ||
      (Array.isArray(candidate.optionValues) &&
        candidate.optionValues.length <= maxOptions &&
        candidate.optionValues.every((option) =>
          isBoundedString(option, maxOptionLength, true)
        ))) &&
    everyOptionalStringBounded(candidate, [
      'inputType',
      'labelText',
      'ariaLabel',
      'ariaDescribedBy',
      'ariaLabelledBy',
      'placeholder',
      'name',
      'id',
      'autocomplete',
      'dataTestId',
      'nearbyText',
      'sectionHeading',
      'groupName',
      'groupLabel',
      'fieldsetLegend',
      'role',
      'frameWarning'
    ]) &&
    optionalEnum(candidate.controlFamily, controlFamilies) &&
    optionalEnum(candidate.candidateSource, candidateSources) &&
    typeof candidate.required === 'boolean' &&
    typeof candidate.visible === 'boolean' &&
    optionalBoolean(candidate.disabled) &&
    optionalBoolean(candidate.readOnly) &&
    optionalBoolean(candidate.stableSelector) &&
    typeof value.kind === 'string' &&
    fieldMappingKinds.has(value.kind as FieldMappingKind) &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    typeof value.sensitive === 'boolean' &&
    typeof value.fillable === 'boolean' &&
    typeof value.requiresDirectReview === 'boolean' &&
    typeof value.approved === 'boolean' &&
    optionalBoolean(value.rejected) &&
    (value.status === undefined || previewStatuses.has(String(value.status))) &&
    (value.value === undefined ||
      (typeof value.value === 'string' && value.value.length <= maxValueLength)) &&
    (value.warning === undefined || isBoundedString(value.warning, maxMessageLength, true)) &&
    (value.explanation === undefined || isBoundedString(value.explanation, maxMessageLength, true))
  );
}

function everyOptionalStringBounded(value: Record<string, any>, keys: string[]): boolean {
  return keys.every(
    (key) =>
      value[key] === undefined ||
      (typeof value[key] === 'string' && value[key].length <= maxMetadataLength)
  );
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalEnum(value: unknown, values: Set<string>): boolean {
  return value === undefined || (typeof value === 'string' && values.has(value));
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

function hasUniqueSelectors(items: FillPreviewItem[]): boolean {
  const selectors = items.map((item) => item.candidate.selector);
  return new Set(selectors).size === selectors.length;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
