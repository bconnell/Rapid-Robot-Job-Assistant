import type { ApplicationSession } from '../models/ApplicationSession';
import type { FieldMapping } from '../models/FieldMapping';
import type { JobPosting } from '../models/JobPosting';
import type { ResumeDocument } from '../models/ResumeDocument';
import type { SavedSearch } from '../models/SavedSearch';
import type { UserProfile } from '../models/UserProfile';
import { buildJobDedupeKey } from '../jobs/JobDedupeService';
import { IndexedDbRepository } from './IndexedDbRepository';

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
    const existing = (await this.list()).find(
      (candidate) => buildJobDedupeKey(candidate) === buildJobDedupeKey(job)
    );
    const now = new Date().toISOString();
    const saved = {
      ...job,
      id: existing?.id ?? job.id,
      status: existing?.status ?? job.status ?? 'saved',
      updatedAt: now
    };
    await this.save(saved);
    return { job: saved, created: !existing };
  }
}

export class ApplicationSessionRepository extends TypedRepository<ApplicationSession> {
  constructor() {
    super(new IndexedDbRepository('applicationSessions'));
  }

  async findByPageUrl(pageUrl: string): Promise<ApplicationSession | undefined> {
    return (await this.list()).find((session) => session.pageUrl === pageUrl);
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
