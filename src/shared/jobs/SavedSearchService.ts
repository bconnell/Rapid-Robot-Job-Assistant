import type { SavedSearch } from '../models/SavedSearch';
import { isProbablyUrl } from '../utils/Validation';

export function createSavedSearch(input: {
  label: string;
  url: string;
  keywords?: string[];
  location?: string;
  remoteOnly?: boolean;
  enabled?: boolean;
}): SavedSearch {
  const { label, url } = input;
  if (!isProbablyUrl(url)) {
    throw new Error('Saved search URL must be an http or https URL.');
  }
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    label: label.trim() || new URL(url).hostname,
    url,
    keywords: input.keywords?.map((keyword) => keyword.trim()).filter(Boolean),
    location: input.location?.trim() || undefined,
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
