import type { JobPosting } from '../models/JobPosting';
import type { ApplicationSession } from '../models/ApplicationSession';

export function orderSavedJobs(jobs: JobPosting[]): JobPosting[] {
  return [...jobs].sort(
    (left, right) =>
      (right.updatedAt ?? right.dateFound).localeCompare(left.updatedAt ?? left.dateFound) ||
      left.id.localeCompare(right.id)
  );
}

export function orderSavedSessions(sessions: ApplicationSession[]): ApplicationSession[] {
  return [...sessions].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
  );
}

function normalizedQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function filterSavedJobs(jobs: JobPosting[], query: string): JobPosting[] {
  const term = normalizedQuery(query);
  if (!term) return jobs;
  return jobs.filter((job) =>
    [
      job.title,
      job.company,
      job.location,
      job.sourceUrl,
      job.status,
      job.remoteStatus
    ].some((value) => value?.toLocaleLowerCase().includes(term))
  );
}

export function filterSavedSessions(
  sessions: ApplicationSession[],
  query: string
): ApplicationSession[] {
  const term = normalizedQuery(query);
  if (!term) return sessions;
  return sessions.filter((session) =>
    [
      session.job?.title,
      session.job?.company,
      session.pageUrl,
      session.notes,
      session.status
    ].some((value) => value?.toLocaleLowerCase().includes(term))
  );
}
