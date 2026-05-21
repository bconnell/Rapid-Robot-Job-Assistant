import type { SavedSearch } from '../models/SavedSearch';
import { isProbablyUrl } from '../utils/Validation';

export function createSavedSearch(label: string, url: string): SavedSearch {
  if (!isProbablyUrl(url)) {
    throw new Error('Saved search URL must be an http or https URL.');
  }
  return {
    id: crypto.randomUUID(),
    label: label.trim() || new URL(url).hostname,
    url,
    createdAt: new Date().toISOString(),
    enabled: true
  };
}
