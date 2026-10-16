import type {
  BackgroundMessage,
  ExtensionCommandResult
} from './ExtensionMessaging';

/**
 * User-triggered extension messages can reject while the MV3 service worker
 * restarts. Report a recoverable failure; never silently retry a write or fill.
 */
export async function safeSendBackgroundMessage<T = unknown>(
  message: BackgroundMessage
): Promise<ExtensionCommandResult<T>> {
  try {
    const value: unknown = await chrome.runtime.sendMessage(message);
    if (!value || typeof value !== 'object' || !('ok' in value)) {
      return {
        ok: false,
        userMessage: 'The extension did not return a valid response. Reopen it and try again.'
      };
    }
    const response = value as ExtensionCommandResult<T>;
    if (typeof response.ok !== 'boolean') {
      return {
        ok: false,
        userMessage: 'The extension returned an invalid status. Reopen it and try again.'
      };
    }
    return response;
  } catch {
    return {
      ok: false,
      userMessage: 'The extension background process is unavailable. Reopen the extension and try again.'
    };
  }
}
