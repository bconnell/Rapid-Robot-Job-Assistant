import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidePanelApp } from '../../src/sidepanel/SidePanelApp';
import { clearAllIndexedDbData } from '../../src/shared/storage/IndexedDbRepository';
import { ApplicationSessionRepository } from '../../src/shared/storage/TypedRepositories';
import type { ApplicationSession } from '../../src/shared/models/ApplicationSession';

const pageUrl = 'https://jobs.example.test/apply/recorded';
const history: ApplicationSession = {
  id: 'history-session',
  pageUrl,
  startedAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
  fieldPreview: [],
  fillResults: [],
  manualVerificationRequired: false,
  notes: 'Synthetic previous session',
  status: 'skipped',
  submittedByUser: false
};

let mount: HTMLDivElement;
let root: Root | undefined;
let reportedUrl = pageUrl;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  reportedUrl = pageUrl;
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'fake-extension',
      sendMessage: vi.fn(async (message: { command?: string }) => {
        if (message.command === 'GET_CURRENT_TAB_STATUS') {
          return {
            ok: true,
            data: {
              ok: true,
              tabId: 1,
              url: reportedUrl,
              reason: 'ready',
              userMessage: 'Ready',
              canAnalyzeWithActiveTab: true,
              canRequestPermission: false,
              hasPersistentPermission: false,
              needsPersistentPermission: false,
              isRestricted: false
            }
          };
        }
        return { ok: true };
      })
    },
    storage: { local: { get: vi.fn().mockResolvedValue({}) } }
  });
  await clearAllIndexedDbData();
  await new ApplicationSessionRepository().save(history);
  mount = document.createElement('div');
  document.body.append(mount);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  root = undefined;
  mount.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderPanel(): Promise<void> {
  root = createRoot(mount);
  await act(async () => {
    root?.render(createElement(SidePanelApp));
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

function findSubmittedButton(): HTMLButtonElement | undefined {
  return [...mount.querySelectorAll('button')].find(
    (button) => button.textContent?.includes('Mark Submitted')
  );
}

describe('manual submission status protection', () => {
  it('does not mark a skipped session submitted without explicit confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderPanel();
    expect(findSubmittedButton()).toBeTruthy();
    await act(async () => {
      findSubmittedButton()?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((await new ApplicationSessionRepository().get(history.id))?.status).toBe('skipped');
  });

  it('refuses a status update when the current target changed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderPanel();
    expect(findSubmittedButton()).toBeTruthy();
    reportedUrl = 'https://jobs.example.test/apply/another';
    await act(async () => {
      findSubmittedButton()?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(confirm).not.toHaveBeenCalled();
    expect((await new ApplicationSessionRepository().get(history.id))?.status).toBe('skipped');
    expect(mount.textContent).toContain('No status change was recorded.');
  });
});
