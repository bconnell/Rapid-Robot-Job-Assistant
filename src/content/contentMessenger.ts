export type ContentCommand =
  | 'PING_CONTENT_SCRIPT'
  | 'OPEN_IN_PAGE_ASSISTANT'
  | 'CLOSE_IN_PAGE_ASSISTANT'
  | 'TOGGLE_IN_PAGE_ASSISTANT'
  | 'IN_PAGE_ASSISTANT_STATUS'
  | 'ANALYZE_JOB_PAGE'
  | 'ANALYZE_APPLICATION_FIELDS'
  | 'FILL_APPROVED_FIELDS';

export interface ContentMessage<T = unknown> {
  command: ContentCommand;
  payload?: T;
}

export interface ContentPingResponse {
  ok: true;
  name: 'Rapid Robot Job Assistant content script';
  ready: true;
  url: string;
}

export type AnalyzeJobPageResponse = ReturnType<typeof import('./pageAnalyzer').analyzeJobPage>;

export type AnalyzeApplicationFieldsResponse = ReturnType<
  typeof import('./pageAnalyzer').analyzeApplicationFields
>;

export interface FillApprovedFieldsResponse {
  verification: ReturnType<
    typeof import('../shared/security/CaptchaAndBotCheckRules').detectCaptchaAndBotCheck
  >;
  results: import('../shared/models/FieldMapping').FillResult[];
}
