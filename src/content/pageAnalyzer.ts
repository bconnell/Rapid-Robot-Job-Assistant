import { detectCaptchaAndBotCheck } from '../shared/security/CaptchaAndBotCheckRules';
import type { FillPreviewItem } from '../shared/models/FieldMapping';
import { extractJobPostingFromDocument } from './jobPageExtractor';
import { detectApplicationIframeWarnings, detectFormFields } from './formDetector';
import { mapFieldCandidates } from './fieldMapper';
import { fillApprovedFields } from './formFiller';
import type { ContentMessage, ContentPingResponse } from './contentMessenger';

declare global {
  // Repeated executeScript calls should not register duplicate listeners.
  var __rapidRobotJobAssistantContentReady: boolean | undefined;
}

export function analyzeJobPage() {
  return {
    job: extractJobPostingFromDocument(document),
    verification: detectCaptchaAndBotCheck(document)
  };
}

export function analyzeApplicationFields() {
  const verification = detectCaptchaAndBotCheck(document);
  const fields = detectFormFields(document);
  const mappings = mapFieldCandidates(fields);
  const iframeWarnings = detectApplicationIframeWarnings(document);
  const manualOnlyCount = mappings.filter(
    (mapping) =>
      mapping.candidate.inputType === 'file' ||
      mapping.candidate.disabled ||
      mapping.candidate.readOnly ||
      !mapping.candidate.visible ||
      mapping.candidate.stableSelector === false ||
      mapping.candidate.candidateSource === 'aria-widget' ||
      ['resumeUpload', 'coverLetterUpload'].includes(mapping.kind)
  ).length;
  return {
    pageUrl: document.location.href,
    fields,
    mappings,
    verification,
    warnings: iframeWarnings.length && fields.length === 0 ? iframeWarnings : [],
    iframeWarnings,
    fieldCount: fields.length,
    fillableCount: mappings.filter((mapping) => mapping.fillable).length,
    manualOnlyCount,
    sensitiveCount: mappings.filter((mapping) => mapping.sensitive).length,
    unknownCount: mappings.filter((mapping) => mapping.kind === 'unknown').length
  };
}

export function pingContentScript(): ContentPingResponse {
  return {
    ok: true,
    name: 'Rapid Robot Job Assistant content script',
    ready: true,
    url: document.location.href
  };
}

if (globalThis.chrome?.runtime?.onMessage && !globalThis.__rapidRobotJobAssistantContentReady) {
  globalThis.__rapidRobotJobAssistantContentReady = true;
  chrome.runtime.onMessage.addListener(
    (message: ContentMessage<FillPreviewItem[]>, _sender, sendResponse) => {
      if (message.command === 'PING_CONTENT_SCRIPT') {
        sendResponse(pingContentScript());
        return true;
      }
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
