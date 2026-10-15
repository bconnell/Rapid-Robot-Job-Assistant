import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { INDEXED_DB } from './StorageKeys';
import type { UserProfile } from '../models/UserProfile';
import type { SavedSearch } from '../models/SavedSearch';
import type { JobPosting } from '../models/JobPosting';
import type { ApplicationSession } from '../models/ApplicationSession';

interface RapidRobotDb extends DBSchema {
  profiles: { key: string; value: unknown };
  resumeDocuments: { key: string; value: unknown };
  jobPostings: { key: string; value: unknown };
  applicationSessions: { key: string; value: unknown };
  fieldMappings: { key: string; value: unknown };
  savedSearches: { key: string; value: unknown };
  tailoringSuggestions: { key: string; value: unknown };
}

type StoreName = keyof RapidRobotDb & (typeof INDEXED_DB.stores)[number];

export class IndexedDbRepository<T extends StoreName> {
  constructor(private readonly storeName: T) {}

  async put(id: string, value: RapidRobotDb[T]['value']): Promise<void> {
    const db = await getDb();
    await db.put(this.storeName, value, id);
  }

  async get(id: string): Promise<RapidRobotDb[T]['value'] | undefined> {
    const db = await getDb();
    return db.get(this.storeName, id);
  }

  async getAll(): Promise<RapidRobotDb[T]['value'][]> {
    const db = await getDb();
    return db.getAll(this.storeName);
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(this.storeName, id);
  }
}

let dbPromise: Promise<IDBPDatabase<RapidRobotDb>> | undefined;

export function getDb(): Promise<IDBPDatabase<RapidRobotDb>> {
  dbPromise ??= openDB<RapidRobotDb>(INDEXED_DB.name, INDEXED_DB.version, {
    upgrade(db) {
      for (const store of INDEXED_DB.stores) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    }
  }).catch((error: unknown) => {
    // Opening can fail transiently. Do not poison every future storage operation.
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

const exportedStores = [
  'profiles',
  'savedSearches',
  'jobPostings',
  'applicationSessions'
] as const;

/**
 * Reads a coherent backup snapshot across all exported collections.
 * The caller must still validate every record before generating the backup.
 */
export async function readLocalDataSnapshot(): Promise<{
  profiles: UserProfile[];
  savedSearches: SavedSearch[];
  jobPostings: JobPosting[];
  applicationSessions: ApplicationSession[];
}> {
  const db = await getDb();
  const tx = db.transaction([...exportedStores], 'readonly');
  const [profiles, savedSearches, jobPostings, applicationSessions] = await Promise.all([
    tx.objectStore('profiles').getAll(),
    tx.objectStore('savedSearches').getAll(),
    tx.objectStore('jobPostings').getAll(),
    tx.objectStore('applicationSessions').getAll()
  ]);
  await tx.done;
  return {
    profiles: profiles as UserProfile[],
    savedSearches: savedSearches as SavedSearch[],
    jobPostings: jobPostings as JobPosting[],
    applicationSessions: applicationSessions as ApplicationSession[]
  };
}

/**
 * Clearing everything is one transaction. A failed clear must not leave an
 * arbitrary subset of collections empty while other local data survives.
 */
export async function clearAllIndexedDbData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([...INDEXED_DB.stores], 'readwrite');
  try {
    for (const store of INDEXED_DB.stores) {
      await tx.objectStore(store).clear();
    }
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // A failed IndexedDB request may have already aborted this transaction.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
