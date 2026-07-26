import type { FillPreviewItem, FillResult } from '../models/FieldMapping';

export interface FillApprovedFieldsRequest {
  pageUrl: string;
  preview: FillPreviewItem[];
}

const maxFillItems = 500;
const maxSelectorLength = 2000;
const maxValueLength = 20000;
const maxMessageLength = 4000;

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
        typeof item.selector === 'string' &&
        item.selector.length > 0 &&
        item.selector.length <= maxSelectorLength &&
        typeof item.ok === 'boolean' &&
        typeof item.message === 'string' &&
        item.message.length <= maxMessageLength
    )
  );
}

function isValidFillPreviewItem(value: unknown): value is FillPreviewItem {
  if (!isRecord(value) || !isRecord(value.candidate)) return false;
  const candidate = value.candidate;
  return (
    typeof candidate.selector === 'string' &&
    candidate.selector.length > 0 &&
    candidate.selector.length <= maxSelectorLength &&
    typeof candidate.tagName === 'string' &&
    candidate.tagName.length > 0 &&
    candidate.tagName.length <= 40 &&
    Array.isArray(candidate.options) &&
    candidate.options.length <= 500 &&
    candidate.options.every((option) => typeof option === 'string' && option.length <= 2000) &&
    (candidate.optionValues === undefined ||
      (Array.isArray(candidate.optionValues) &&
        candidate.optionValues.length <= 500 &&
        candidate.optionValues.every(
          (option) => typeof option === 'string' && option.length <= 2000
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
      'controlFamily',
      'candidateSource',
      'frameWarning'
    ]) &&
    typeof candidate.required === 'boolean' &&
    typeof candidate.visible === 'boolean' &&
    typeof value.kind === 'string' &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    typeof value.sensitive === 'boolean' &&
    typeof value.fillable === 'boolean' &&
    typeof value.requiresDirectReview === 'boolean' &&
    typeof value.approved === 'boolean' &&
    (value.value === undefined ||
      (typeof value.value === 'string' && value.value.length <= maxValueLength))
  );
}

function everyOptionalStringBounded(value: Record<string, any>, keys: string[]): boolean {
  return keys.every(
    (key) =>
      value[key] === undefined ||
      (typeof value[key] === 'string' && value[key].length <= maxValueLength)
  );
}

function hasUniqueSelectors(items: FillPreviewItem[]): boolean {
  const selectors = items.map((item) => item.candidate.selector);
  return new Set(selectors).size === selectors.length;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
