export interface AiRequestReview {
  id: string;
  purpose: string;
  dataPreview: string;
  redactionsApplied: string[];
  approved: boolean;
  createdAt: string;
}

export function createAiRequestReview(
  purpose: string,
  dataPreview: string,
  redactionsApplied: string[]
): AiRequestReview {
  return {
    id: crypto.randomUUID(),
    purpose,
    dataPreview,
    redactionsApplied,
    approved: false,
    createdAt: new Date().toISOString()
  };
}
