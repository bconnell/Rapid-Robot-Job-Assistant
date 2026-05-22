import { detectCaptchaAndBotCheck } from '../shared/security/CaptchaAndBotCheckRules';
import type { FillPreviewItem } from '../shared/models/FieldMapping';
import { extractJobPostingFromDocument } from './jobPageExtractor';
import { detectFormFields } from './formDetector';
import { mapFieldCandidates } from './fieldMapper';
import { fillApprovedFields } from './formFiller';
import type { ContentMessage } from './contentMessenger';

export function analyzeJobPage() {
  return {
    job: extractJobPostingFromDocument(document),
    verification: detectCaptchaAndBotCheck(document)
  };
}

export function analyzeApplicationFields() {
  const verification = detectCaptchaAndBotCheck(document);
  const fields = detectFormFields(document);
  return {
    pageUrl: document.location.href,
    fields,
    mappings: mapFieldCandidates(fields),
    verification
  };
}

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(
    (message: ContentMessage<FillPreviewItem[]>, _sender, sendResponse) => {
      if (message.command === 'ANALYZE_JOB_PAGE') {
        sendResponse(analyzeJobPage());
        return true;
      }
      if (message.command === 'ANALYZE_APPLICATION_FIELDS') {
        sendResponse(analyzeApplicationFields());
        return true;
      }
      if (message.command === 'FILL_APPROVED_FIELDS') {
        const verification = detectCaptchaAndBotCheck(document);
        if (verification.detected) {
          sendResponse({ verification, results: [] });
          return true;
        }
        sendResponse({
          verification,
          results: fillApprovedFields(message.payload ?? [], document)
        });
        return true;
      }
      return false;
    }
  );
}
