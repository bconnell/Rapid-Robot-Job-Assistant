import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeInPageAssistant,
  openInPageAssistant
} from '../../src/content/inPageAssistant/InPageAssistantController';

const messages: unknown[] = [];

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function installChromeStub(): void {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        id: 'test-extension',
        sendMessage: vi.fn(async (message: unknown) => {
          messages.push(message);
          const command = (message as { command?: string }).command;
          if (command === 'GET_ACTIVE_PROFILE') {
            return {
              ok: true,
              data: {
                id: 'profile-1',
                contact: {
                  fullName: 'Alex Morgan',
                  email: 'alex.morgan@example.test'
                },
                skills: [],
                desiredTitles: [],
                experience: [],
                education: [],
                certifications: [],
                updatedAt: '2026-05-22T00:00:00.000Z'
              }
            };
          }
          if (command === 'SAVE_ANALYZED_JOB')
            return { ok: true, data: (message as { payload?: unknown }).payload };
          if (command === 'SAVE_APPLICATION_SESSION')
            return { ok: true, data: (message as { payload?: unknown }).payload };
          if (command === 'OPEN_OPTIONS') return { ok: true };
          return { ok: true };
        })
      }
    }
  });
}

function installCryptoStub(): void {
  const existing = globalThis.crypto ?? {};
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...existing,
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001')
    }
  });
}

beforeEach(() => {
  messages.length = 0;
  closeInPageAssistant();
  document.documentElement.innerHTML = '<head><title></title></head><body></body>';
  installChromeStub();
  installCryptoStub();
});

afterEach(() => {
  closeInPageAssistant();
  vi.restoreAllMocks();
});

describe('in-page assistant controller hardening', () => {
  it('restores a minimized assistant instead of leaving the panel hidden', async () => {
    await openInPageAssistant();
    const root = document.getElementById('rapid-robot-job-assistant-root');
    const shadow = root?.shadowRoot;
    expect(shadow?.querySelector('.panel')).toBeTruthy();

    shadow?.querySelector<HTMLButtonElement>('[data-action="minimize"]')?.click();
    expect(shadow?.querySelector('.panel')?.classList.contains('minimized')).toBe(true);

    await openInPageAssistant();
    expect(root?.shadowRoot?.querySelector('.panel')?.classList.contains('minimized')).toBe(false);
  });

  it('does not save a weak empty page as a real analyzed job', async () => {
    await openInPageAssistant();
    document
      .getElementById('rapid-robot-job-assistant-root')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="analyze-job"]')
      ?.click();

    await flushAsyncWork();

    expect(
      messages.some((message) => (message as { command?: string }).command === 'SAVE_ANALYZED_JOB')
    ).toBe(false);
  });

  it('allows suggested values to be edited before individual approval', async () => {
    document.body.innerHTML =
      '<main><h1>Software Engineer</h1><form><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" /></form></main>';
    await openInPageAssistant();
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;

    shadow?.querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')?.click();
    await flushAsyncWork();

    const valueInput = shadow?.querySelector<HTMLInputElement>('[data-field-value]');
    expect(valueInput).toBeTruthy();
    expect(valueInput?.disabled).toBe(false);
    expect(valueInput?.value).toBe('alex.morgan@example.test');
  });
});
