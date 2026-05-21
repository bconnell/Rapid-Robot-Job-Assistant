export interface AiRequest {
  purpose: 'tailoring' | 'cover-letter' | 'application-answer';
  redactedPayload: unknown;
  approvedByUser: boolean;
}

export interface AiResponse {
  text: string;
  warnings: string[];
}

export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  generate(request: AiRequest): Promise<AiResponse>;
}
