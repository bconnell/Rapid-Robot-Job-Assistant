import type { JobPosting } from '../models/JobPosting';
import type { UserProfile } from '../models/UserProfile';
import { matchJobToProfile } from '../jobs/JobMatchService';
import { checkTruthfulness } from './TruthfulnessRules';

export interface TailoringSuggestion {
  id: string;
  originalText: string;
  suggestedText: string;
  reason: string;
  matchedJobKeywords: string[];
  truthfulnessWarning?: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'suggested' | 'accepted' | 'edited' | 'rejected';
}

export function createLocalTailoringSuggestions(
  job: JobPosting,
  profile: UserProfile
): TailoringSuggestion[] {
  const match = matchJobToProfile(job, profile);
  const sourceText = `${profile.summary ?? ''} ${profile.skills.join(' ')}`;
  const suggestions: TailoringSuggestion[] = [];

  if (match.matchedSkills.length) {
    const suggestedText = `Lead with matching skills: ${match.matchedSkills.slice(0, 6).join(', ')}.`;
    const check = checkTruthfulness(suggestedText, sourceText);
    suggestions.push({
      id: crypto.randomUUID(),
      originalText: profile.summary ?? '',
      suggestedText,
      reason: 'These skills appear in the job posting and in the saved profile.',
      matchedJobKeywords: match.matchedSkills,
      truthfulnessWarning: check.warnings[0],
      riskLevel: check.allowed ? 'low' : 'high',
      status: 'suggested'
    });
  }

  for (const keyword of match.missingKeywords.slice(0, 5)) {
    suggestions.push({
      id: crypto.randomUUID(),
      originalText: '',
      suggestedText: `Do not claim "${keyword}" unless it is already true and supported by your profile.`,
      reason: 'The job mentions this keyword, but the saved profile does not clearly support it.',
      matchedJobKeywords: [keyword],
      truthfulnessWarning: 'Unsupported keywords should not be added as qualifications.',
      riskLevel: 'medium',
      status: 'suggested'
    });
  }

  return suggestions;
}
