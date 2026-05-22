export type BackgroundCommand =
  | 'OPEN_SIDE_PANEL'
  | 'ANALYZE_CURRENT_JOB_PAGE'
  | 'ANALYZE_APPLICATION_FIELDS'
  | 'FILL_APPROVED_FIELDS'
  | 'GET_CURRENT_TAB_STATUS'
  | 'REQUEST_CURRENT_SITE_PERMISSION';

export interface BackgroundMessage<T = unknown> {
  command: BackgroundCommand;
  payload?: T;
}

export interface ExtensionCommandResult<T = unknown> {
  ok: boolean;
  data?: T;
  response?: T;
  error?: string;
  userMessage?: string;
  needsPermission?: boolean;
  originPattern?: string;
  tabUrl?: string;
  reason?: string;
}

export interface PermissionRequestResult {
  granted: boolean;
  originPattern?: string;
  userMessage: string;
}
