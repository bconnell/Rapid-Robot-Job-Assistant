import type { ImportPreview } from './LocalDataTransfer';
import { validateLocalDataImport } from './LocalDataTransfer';
import { getDb } from '../storage/IndexedDbRepository';
import { INDEXED_DB } from '../storage/StorageKeys';

/**
 * Atomically adds new backup records without replacing existing extension data.
 * Browser settings and active-profile selection are not part of this operation.
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
    },
    {
      store: 'resumeDocuments' as const,
      label: 'resume document',
      records: preview.data.resumeDocuments ?? []
    },
    {
      store: 'fieldMappings' as const,
      label: 'field mapping',
      records: preview.data.fieldMappings ?? []
    },
    {
      store: 'tailoringSuggestions' as const,
      label: 'tailoring suggestion',
      records: preview.data.tailoringSuggestions ?? []
    }
  ];
  const db = await getDb();
  const tx = db.transaction([...INDEXED_DB.stores], 'readwrite');

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
