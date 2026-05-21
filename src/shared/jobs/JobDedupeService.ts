import type { JobPosting } from '../models/JobPosting';
import { normalizeKey } from '../utils/Validation';

export function buildJobDedupeKey(
  job: Pick<JobPosting, 'sourceUrl' | 'title' | 'company' | 'location'>
): string {
  const urlKey = normalizeUrl(job.sourceUrl);
  const semanticKey = [job.title, job.company ?? '', job.location ?? '']
    .map(normalizeKey)
    .join('|');
  return `${urlKey}|${semanticKey}`;
}

export function dedupeJobs(jobs: JobPosting[]): JobPosting[] {
  const seen = new Set<string>();
  const result: JobPosting[] = [];

  for (const job of jobs) {
    const key = buildJobDedupeKey(job);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(job);
    }
  }

  return result;
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((param) =>
      url.searchParams.delete(param)
    );
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return normalizeKey(value);
  }
}
