import type { AiProvider, AiRequest, AiResponse } from './AiProvider';
import { assertUserApproved } from '../security/PrivacyGuards';

export class OllamaProvider implements AiProvider {
  readonly id = 'ollama';
  readonly displayName = 'Ollama local provider';

  constructor(private readonly endpoint: string) {}

  async generate(request: AiRequest): Promise<AiResponse> {
    assertUserApproved('Ollama request', request.approvedByUser);
    return {
      text: '',
      warnings: [`Ollama endpoint ${this.endpoint || 'not configured'} is scaffolded for Batch 1.`]
    };
  }
}
