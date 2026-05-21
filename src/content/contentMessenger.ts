export type ContentCommand =
  | 'ANALYZE_JOB_PAGE'
  | 'ANALYZE_APPLICATION_FIELDS'
  | 'FILL_APPROVED_FIELDS';

export interface ContentMessage<T = unknown> {
  command: ContentCommand;
  payload?: T;
}
