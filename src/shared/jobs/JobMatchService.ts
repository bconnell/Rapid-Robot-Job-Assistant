import type { JobPosting } from '../models/JobPosting';
import type { UserProfile } from '../models/UserProfile';
import { normalizeKey } from '../utils/Validation';

export interface JobMatch {
  matchedSkills: string[];
  missingKeywords: string[];
  score: number;
}

export function matchJobToProfile(job: JobPosting, profile: UserProfile): JobMatch {
  const jobText = normalizeKey(`${job.title} ${job.descriptionText} ${job.requirementsText ?? ''}`);
  const matchedSkills = profile.skills.filter((skill) => jobText.includes(normalizeKey(skill)));
  const missingKeywords = job.detectedKeywords.filter(
    (keyword) => !profile.skills.some((skill) => normalizeKey(skill) === normalizeKey(keyword))
  );
  const score = job.detectedKeywords.length
    ? Math.round((matchedSkills.length / job.detectedKeywords.length) * 100)
    : 0;
  return { matchedSkills, missingKeywords, score };
}
