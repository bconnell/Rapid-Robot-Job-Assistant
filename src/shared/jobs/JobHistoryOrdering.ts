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
