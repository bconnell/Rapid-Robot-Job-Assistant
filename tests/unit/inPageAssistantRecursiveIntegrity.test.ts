import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeInPageAssistant,
  openInPageAssistant
} from '../../src/content/inPageAssistant/InPageAssistantController';

const messages: Array<{ command?: string; payload?: unknown }> = [];

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  messages.length = 0;
  closeInPageAssistant();
  document.documentElement.innerHTML = '<head><title></title></head><body></body>';
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        id: 'test-extension',
        sendMessage: vi.fn(async (message: { command?: string; payload?: unknown }) => {
          messages.push(message);
          if (message.command === 'GET_ACTIVE_PROFILE') {
            return {
              ok: true,
              data: {
                id: 'profile-1',
                contact: { fullName: 'Alex Morgan', email: 'alex@example.test' },
                skills: [],
                experience: [],
                education: [],
                certifications: [],
                projects: [],
                desiredTitles: [],
                updatedAt: '2026-07-26T00:00:00.000Z'
              }
            };
          }
          if (message.command === 'GET_RECENT_SESSION_FOR_PAGE') {
            return { ok: true, data: undefined };
          }
          if (message.command === 'SAVE_APPLICATION_SESSION') {
            return { ok: true, data: message.payload };
          }
          if (message.command === 'SAVE_ANALYZED_JOB') {
            return { ok: true, data: message.payload };
          }
          return { ok: true };
        })
      }
    }
  });
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001') }
  });
});

afterEach(() => {
  closeInPageAssistant();
  vi.restoreAllMocks();
});

describe('in-page assistant recursive integrity', () => {
  it('shows every detected field rather than hiding fields after the first twelve', async () => {
    document.body.innerHTML = `<main><h1>Application</h1><form>${Array.from(
      { length: 13 },
      (_, index) =>
        `<label for="email-${index}">Email</label><input id="email-${index}" type="email" autocomplete="email" />`
    ).join('')}</form></main>`;
    await openInPageAssistant();
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')?.click();
    await flushAsyncWork();
    expect(shadow?.querySelectorAll('[data-field-value]')).toHaveLength(13);
  });

  it('clears approval when an approved value is edited', async () => {
    document.body.innerHTML =
      '<main><h1>Application</h1><form><label for="email">Email</label><input id="email" type="email" autocomplete="email" /></form></main>';
    await openInPageAssistant();
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')?.click();
    await flushAsyncWork();
    shadow?.querySelector<HTMLButtonElement>('[data-action="approve-safe"]')?.click();
    await flushAsyncWork();

    const editor = shadow?.querySelector<HTMLInputElement>('[data-field-value]');
    const fill = shadow?.querySelector<HTMLButtonElement>('[data-action="fill"]');
    expect(fill?.disabled).toBe(false);
    if (editor) {
      editor.value = 'changed@example.test';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(fill?.disabled).toBe(true);
  });

  it('does not save an empty application session when no fields are detected', async () => {
    document.body.innerHTML = '<main><h1>Application</h1><p>No form loaded.</p></main>';
    await openInPageAssistant();
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')?.click();
    await flushAsyncWork();
    expect(messages.some((message) => message.command === 'SAVE_APPLICATION_SESSION')).toBe(false);
  });
});
