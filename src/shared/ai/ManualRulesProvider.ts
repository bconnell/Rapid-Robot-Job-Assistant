import type { AiProvider, AiRequest, AiResponse } from './AiProvider';

export class ManualRulesProvider implements AiProvider {
  readonly id = 'manual';
  readonly displayName = 'Manual local rules';

  async generate(request: AiRequest): Promise<AiResponse> {
    if (!request.approvedByUser) {
      return {
        text: '',
        warnings: ['AI-style generation requires user approval, even in manual mode.']
      };
    }
    return {
      text: 'Review the matched skills, keep only true claims, and edit wording before using it.',
      warnings: ['Manual rules do not send data outside the browser.']
    };
  }
}
