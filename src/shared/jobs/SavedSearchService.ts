import type { SavedSearch } from '../models/SavedSearch';
import { uniqueStrings } from '../utils/Validation';

const maxLabelLength = 200;
const maxLocationLength = 300;
const maxKeywords = 100;
const maxKeywordLength = 200;

export function createSavedSearch(input: {
  label: string;
  url: string;
  keywords?: string[];
  location?: string;
  remoteOnly?: boolean;
  enabled?: boolean;
}): SavedSearch {
  const url = normalizeSavedSearchUrl(input.url);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    label: (input.label.trim() || new URL(url).hostname).slice(0, maxLabelLength),
    url,
    keywords: uniqueStrings(input.keywords ?? [])
      .map((keyword) => keyword.slice(0, maxKeywordLength))
      .slice(0, maxKeywords),
    location: input.location?.trim().slice(0, maxLocationLength) || undefined,
    remoteOnly: input.remoteOnly ?? false,
    createdAt: now,
    updatedAt: now,
    enabled: input.enabled ?? true
  };
}

export function markSavedSearchChecked(
  search: SavedSearch,
  status = 'Manual check saved.'
): SavedSearch {
  const now = new Date().toISOString();
  return { ...search, lastCheckedAt: now, lastCheckStatus: status, updatedAt: now };
}

function normalizeSavedSearchUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Saved search URL must be an http or https URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Saved search URL must be an http or https URL.');
  }
  if (url.username || url.password) {
    throw new Error('Saved search URLs cannot contain embedded credentials.');
  }
  url.hash = '';
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((name) =>
    url.searchParams.delete(name)
  );
  return url.toString();
}
