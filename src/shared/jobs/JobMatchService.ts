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
  const matchedSkills = profile.skills.filter((skill) => matchesPhrase(jobText, skill));
  const profileSkillKeys = new Set(profile.skills.map(normalizeKey).filter(Boolean));
  const detectedKeywords = [...new Set(job.detectedKeywords.map(normalizeKey).filter(Boolean))];
  const matchedKeywords = detectedKeywords.filter((keyword) => profileSkillKeys.has(keyword));
  const missingKeywords = detectedKeywords.filter((keyword) => !profileSkillKeys.has(keyword));
  const score = detectedKeywords.length
    ? Math.min(100, Math.round((matchedKeywords.length / detectedKeywords.length) * 100))
    : 0;
  return { matchedSkills, missingKeywords, score };
}

function matchesPhrase(text: string, phrase: string): boolean {
  const normalized = normalizeKey(phrase);
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}
