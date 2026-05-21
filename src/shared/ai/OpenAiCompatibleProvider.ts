import type { AiProvider, AiRequest, AiResponse } from './AiProvider';
import { assertUserApproved } from '../security/PrivacyGuards';

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = 'openai-compatible';
  readonly displayName = 'OpenAI-compatible provider';

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string
  ) {}

  async generate(request: AiRequest): Promise<AiResponse> {
    assertUserApproved('AI request', request.approvedByUser);
    if (!this.endpoint || !this.apiKey) {
      return { text: '', warnings: ['Provider is not configured.'] };
    }
    return {
      text: '',
      warnings: ['Network AI calls are scaffolded for Batch 1 and intentionally not executed yet.']
    };
  }
}
