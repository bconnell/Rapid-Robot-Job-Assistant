import type { ApplicationSession } from '../models/ApplicationSession';
import type { FieldMapping } from '../models/FieldMapping';
import type { JobPosting } from '../models/JobPosting';
import type { ResumeDocument } from '../models/ResumeDocument';
import type { SavedSearch } from '../models/SavedSearch';
import type { UserProfile } from '../models/UserProfile';
import { buildJobDedupeKey } from '../jobs/JobDedupeService';
import { normalizePageUrl } from '../extension/PageCommandIntegrity';
import { getDb, IndexedDbRepository } from './IndexedDbRepository';

class TypedRepository<T> {
  constructor(private readonly repo: IndexedDbRepository<any>) {}

  save(value: T & { id: string }): Promise<void> {
    return this.repo.put(value.id, value);
  }

  async get(id: string): Promise<T | undefined> {
    return (await this.repo.get(id)) as T | undefined;
  }

  async list(): Promise<T[]> {
    return (await this.repo.getAll()) as T[];
  }

  delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

export class ProfileRepository extends TypedRepository<UserProfile> {
  constructor() {
    super(new IndexedDbRepository('profiles'));
  }
}

export class ResumeDocumentRepository extends TypedRepository<ResumeDocument> {
  constructor() {
    super(new IndexedDbRepository('resumeDocuments'));
  }
}

export class JobPostingRepository extends TypedRepository<JobPosting> {
  constructor() {
    super(new IndexedDbRepository('jobPostings'));
  }

  async saveOrUpdate(job: JobPosting): Promise<{ job: JobPosting; created: boolean }> {
    // Read and write under one store lock. The side panel and in-page assistant
    // may analyze the same posting concurrently; neither should create a duplicate.
    const db = await getDb();
    const tx = db.transaction('jobPostings', 'readwrite');
    try {
      const store = tx.objectStore('jobPostings');
      const jobs = (await store.getAll()) as JobPosting[];
      const key = buildJobDedupeKey(job);
      const existing = jobs.find((candidate) => buildJobDedupeKey(candidate) === key);
      const saved: JobPosting = {
        ...job,
        id: existing?.id ?? job.id,
        status: existing?.status ?? job.status ?? 'saved',
        updatedAt: new Date().toISOString()
      };
      await store.put(saved, saved.id);
      await tx.done;
      return { job: saved, created: !existing };
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // An IndexedDB request failure may have aborted the transaction.
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  }
}

export class ApplicationSessionRepository extends TypedRepository<ApplicationSession> {
  constructor() {
    super(new IndexedDbRepository('applicationSessions'));
  }

  async findByPageUrl(pageUrl: string): Promise<ApplicationSession | undefined> {
    const normalized = normalizePageUrl(pageUrl);
    if (!normalized) return undefined;
    const matches = (await this.list()).filter(
      (session) => normalizePageUrl(session.pageUrl) === normalized
    );
    // A restored archive may contain more than one session for the same page.
    // Choose the most recently updated instead of IndexedDB insertion order.
    return matches.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
    )[0];
  }
}

export class FieldMappingRepository extends TypedRepository<FieldMapping & { id: string }> {
  constructor() {
    super(new IndexedDbRepository('fieldMappings'));
  }
}

export class SavedSearchRepository extends TypedRepository<SavedSearch> {
  constructor() {
    super(new IndexedDbRepository('savedSearches'));
  }

  async markChecked(id: string, status: string): Promise<SavedSearch | undefined> {
    const search = await this.get(id);
    if (!search) return undefined;
    const updated = {
      ...search,
      lastCheckedAt: new Date().toISOString(),
      lastCheckStatus: status,
      updatedAt: new Date().toISOString()
    };
    await this.save(updated);
    return updated;
  }
}

export class TailoringSuggestionRepository extends TypedRepository<unknown & { id: string }> {
  constructor() {
    super(new IndexedDbRepository('tailoringSuggestions'));
  }
}
