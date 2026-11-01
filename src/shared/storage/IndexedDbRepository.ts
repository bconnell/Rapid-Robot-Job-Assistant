import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { INDEXED_DB } from './StorageKeys';
import type { UserProfile } from '../models/UserProfile';
import type { ResumeDocument } from '../models/ResumeDocument';
import type { FieldMapping } from '../models/FieldMapping';
import type { TailoringSuggestion } from '../ai/TailoringService';
import type { SavedSearch } from '../models/SavedSearch';
import type { JobPosting } from '../models/JobPosting';
import type { ApplicationSession } from '../models/ApplicationSession';
import { maxRecordsPerCollection } from '../data/LocalDataLimits';
import { measureJsonUtf8BytesWithinLimit } from '../data/BoundedJsonSize';

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

const exportedStores = INDEXED_DB.stores;

/**
 * Reads a coherent backup snapshot across all seven IndexedDB stores.
 * The caller must still validate every record before generating the backup.
 */
export async function readLocalDataSnapshot(limits?: { maxSerializedBytes?: number }): Promise<{
  profiles: UserProfile[];
  savedSearches: SavedSearch[];
  jobPostings: JobPosting[];
  applicationSessions: ApplicationSession[];
  resumeDocuments: ResumeDocument[];
  fieldMappings: Array<FieldMapping & { id: string }>;
  tailoringSuggestions: TailoringSuggestion[];
}> {
  const db = await getDb();
  const tx = db.transaction([...exportedStores], 'readonly');
  const maxSerializedBytes = limits?.maxSerializedBytes;
  if (maxSerializedBytes !== undefined) {
    let totalSerializedBytes = 0;
    const readStoreWithinLimits = async (storeName: StoreName): Promise<unknown[]> => {
      const values: unknown[] = [];
      let cursor = await tx.objectStore(storeName).openCursor();
      while (cursor) {
        if (values.length >= maxRecordsPerCollection) {
          throw new Error('LOCAL_DATA_BACKUP_RECORD_LIMIT_EXCEEDED');
        }
        const measured = measureJsonUtf8BytesWithinLimit(
          cursor.value,
          maxSerializedBytes - totalSerializedBytes - 1
        );
        if (!measured.ok) {
          throw new Error(
            measured.reason === 'too-large'
              ? 'LOCAL_DATA_BACKUP_SIZE_LIMIT_EXCEEDED'
              : 'LOCAL_DATA_BACKUP_SERIALIZATION_FAILED'
          );
        }
        const serializedBytes = measured.bytes + 1;
        totalSerializedBytes += serializedBytes;
        if (totalSerializedBytes > maxSerializedBytes) {
          throw new Error('LOCAL_DATA_BACKUP_SIZE_LIMIT_EXCEEDED');
        }
        values.push(cursor.value);
        cursor = await cursor.continue();
      }
      return values;
    };

    try {
      const collections = await Promise.all(exportedStores.map(readStoreWithinLimits));
      await tx.done;
      const [
        profiles,
        resumeDocuments,
        jobPostings,
        applicationSessions,
        fieldMappings,
        savedSearches,
        tailoringSuggestions
      ] = collections;
      return {
        profiles: profiles as UserProfile[],
        savedSearches: savedSearches as SavedSearch[],
        jobPostings: jobPostings as JobPosting[],
        applicationSessions: applicationSessions as ApplicationSession[],
        resumeDocuments: resumeDocuments as ResumeDocument[],
        fieldMappings: fieldMappings as Array<FieldMapping & { id: string }>,
        tailoringSuggestions: tailoringSuggestions as TailoringSuggestion[]
      };
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // A failed cursor request may already have aborted the transaction.
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  }
  const [
    profiles,
    savedSearches,
    jobPostings,
    applicationSessions,
    resumeDocuments,
    fieldMappings,
    tailoringSuggestions
  ] = await Promise.all([
    tx.objectStore('profiles').getAll(),
    tx.objectStore('savedSearches').getAll(),
    tx.objectStore('jobPostings').getAll(),
    tx.objectStore('applicationSessions').getAll(),
    tx.objectStore('resumeDocuments').getAll(),
    tx.objectStore('fieldMappings').getAll(),
    tx.objectStore('tailoringSuggestions').getAll()
  ]);
  await tx.done;
  return {
    profiles: profiles as UserProfile[],
    savedSearches: savedSearches as SavedSearch[],
    jobPostings: jobPostings as JobPosting[],
    applicationSessions: applicationSessions as ApplicationSession[],
    resumeDocuments: resumeDocuments as ResumeDocument[],
    fieldMappings: fieldMappings as Array<FieldMapping & { id: string }>,
    tailoringSuggestions: tailoringSuggestions as TailoringSuggestion[]
  };
}

/**
 * A profile and its imported resume must commit or roll back together.
 * Active-profile selection lives in separate Chrome storage and is updated
 * only after this transaction completes.
 */
export async function saveProfileWithResume(
  profile: UserProfile,
  resume: ResumeDocument
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['profiles', 'resumeDocuments'], 'readwrite');
  try {
    // A resume import creates a new profile. Never overwrite one already saved.
    await tx.objectStore('profiles').add(profile, profile.id);
    await tx.objectStore('resumeDocuments').add(resume, resume.id);
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // The browser may already have aborted a failed transaction.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

/**
 * Each targeted cleanup is one transaction, including all of its related
 * stores. A failed clear must not delete a subset of the requested records.
 */
export async function clearIndexedDbStores(stores: readonly StoreName[]): Promise<void> {
  if (stores.length === 0) return;
  const db = await getDb();
  const tx = db.transaction([...stores], 'readwrite');
  try {
    for (const store of stores) {
      await tx.objectStore(store).clear();
    }
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // The browser may already have aborted a failed transaction.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export async function clearAllIndexedDbData(): Promise<void> {
  await clearIndexedDbStores(INDEXED_DB.stores);
}
