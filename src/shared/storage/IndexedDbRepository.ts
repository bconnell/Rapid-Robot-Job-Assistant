import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { INDEXED_DB } from './StorageKeys';

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
  });
  return dbPromise;
}

export async function clearAllIndexedDbData(): Promise<void> {
  const db = await getDb();
  await Promise.all(INDEXED_DB.stores.map((store) => db.clear(store)));
}
