const unsupportedClaimPatterns = [
  /\b\d+\+?\s+years\b/i,
  /\bcertified\b/i,
  /\bdegree\b/i,
  /\bexpert\b/i
];

export interface TruthfulnessCheck {
  allowed: boolean;
  warnings: string[];
}

export function checkTruthfulness(suggestion: string, sourceText: string): TruthfulnessCheck {
  const warnings: string[] = [];
  for (const pattern of unsupportedClaimPatterns) {
    const match = suggestion.match(pattern)?.[0];
    if (match && !sourceText.toLowerCase().includes(match.toLowerCase())) {
      warnings.push(`Suggestion may introduce unsupported claim: ${match}`);
    }
  }
  return { allowed: warnings.length === 0, warnings };
}
