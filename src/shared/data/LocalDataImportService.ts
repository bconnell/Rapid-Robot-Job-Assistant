import type { ImportPreview } from './LocalDataTransfer';
import { validateLocalDataImport } from './LocalDataTransfer';
import { getDb } from '../storage/IndexedDbRepository';

/**
 * Atomically adds new backup records without replacing existing extension data.
 * Settings, active profile, and non-exported stores are not part of this operation.
 */
export async function importLocalDataAdditively(input: unknown): Promise<ImportPreview['counts']> {
  // A previewed object may have changed before the user confirms restoration.
  const preview = validateLocalDataImport(input);
  if (!preview.valid || !preview.data) {
    throw new Error('Import data failed validation. Select and review the file again.');
  }

  const collections = [
    { store: 'profiles' as const, label: 'profile', records: preview.data.profiles },
    { store: 'savedSearches' as const, label: 'saved search', records: preview.data.savedSearches },
    { store: 'jobPostings' as const, label: 'job', records: preview.data.jobPostings },
    {
      store: 'applicationSessions' as const,
      label: 'application session',
      records: preview.data.applicationSessions
    }
  ];
  const db = await getDb();
  const tx = db.transaction(
    ['profiles', 'savedSearches', 'jobPostings', 'applicationSessions'],
    'readwrite'
  );

  try {
    // Transaction locking prevents another writer from racing the collision checks.
    for (const collection of collections) {
      const store = tx.objectStore(collection.store);
      for (const record of collection.records) {
        if ((await store.get(record.id)) !== undefined) {
          throw new Error(
            'An existing ' +
              collection.label +
              ' has the same ID. No records were imported. Existing data was preserved.'
          );
        }
      }
    }

    for (const collection of collections) {
      const store = tx.objectStore(collection.store);
      for (const record of collection.records) {
        await store.put(record, record.id);
      }
    }

    await tx.done;
    return preview.counts;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // A rejected database request may have aborted the transaction already.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
