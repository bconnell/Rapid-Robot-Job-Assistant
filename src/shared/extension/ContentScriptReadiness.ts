export type ContentRuntimeReason = 'content-not-ready' | 'content-message-failed' | 'tab-changed';

export interface ContentRuntimeFailure {
  reason: ContentRuntimeReason;
  userMessage: string;
}

export interface TabSnapshot {
  id?: number;
  url?: string;
}

export const contentNotReadyMessage =
  'The content script did not start. Rebuild and reload the extension from dist.';

export function didTabChange(initial: TabSnapshot, current: TabSnapshot | undefined): boolean {
  return !current?.id || current.id !== initial.id || current.url !== initial.url;
}

export function classifyContentMessageFailure(
  error: unknown,
  tabChanged: boolean
): ContentRuntimeFailure {
  if (tabChanged) {
    return {
      reason: 'tab-changed',
      userMessage: 'The active page changed before analysis finished. Open the page and try again.'
    };
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (
    lower.includes('receiving end does not exist') ||
    lower.includes('could not establish connection') ||
    lower.includes('message port closed')
  ) {
    return {
      reason: 'content-not-ready',
      userMessage: contentNotReadyMessage
    };
  }

  return {
    reason: 'content-message-failed',
    userMessage: 'Content script could not respond on this page. Reload the page and try again.'
  };
}

export async function waitForContentReadiness<T>(
  ping: () => Promise<T | undefined>,
  attempts = 5,
  delayMs = 75,
  wait: (ms: number) => Promise<void> = defaultWait
): Promise<T | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await ping();
    if (response) return response;
    await wait(delayMs);
  }
  return undefined;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
