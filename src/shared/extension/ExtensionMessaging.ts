export type BackgroundCommand =
  | 'OPEN_ASSISTANT'
  | 'OPEN_IN_PAGE_ASSISTANT'
  | 'OPEN_SIDE_PANEL'
  | 'OPEN_WORKSPACE_TAB'
  | 'OPEN_OPTIONS'
  | 'GET_ACTIVE_PROFILE'
  | 'SAVE_ANALYZED_JOB'
  | 'SAVE_APPLICATION_SESSION'
  | 'GET_RECENT_SESSION_FOR_PAGE'
  | 'SAVE_APPLICATION_NOTES'
  | 'ANALYZE_CURRENT_JOB_PAGE'
  | 'ANALYZE_APPLICATION_FIELDS'
  | 'FILL_APPROVED_FIELDS'
  | 'GET_CURRENT_TAB_STATUS'
  | 'USE_CURRENT_PAGE'
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

export interface OpenAssistantResult {
  opened: boolean;
  openedAs: 'assistant-panel' | 'assistant-tab' | 'none';
  userMessage: string;
  reason?: string;
  targetRemembered?: boolean;
}

export type OpenWorkspaceResult = OpenAssistantResult;
