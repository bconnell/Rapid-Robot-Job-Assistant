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
                skills: ['TypeScript'],
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
  it('opens without a profile when the background profile request rejects', async () => {
    const sendMessage = vi.fn(async (message: unknown) => {
      const command = (message as { command?: string }).command;
      if (command === 'GET_ACTIVE_PROFILE') {
        throw new Error('Synthetic private worker error');
      }
      return { ok: true, data: undefined };
    });
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: { runtime: { id: 'test-extension', sendMessage } }
    });

    await expect(openInPageAssistant()).resolves.toMatchObject({ opened: true });
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;
    expect(shadow?.textContent).toContain('Profile needed before fill');
    expect(shadow?.textContent).not.toContain('Synthetic private worker error');
    expect(
      sendMessage.mock.calls.filter(
        ([message]) => (message as { command?: string }).command === 'GET_ACTIVE_PROFILE'
      )
    ).toHaveLength(1);
  });

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

  it('shows local supported skill matches after analyzing an actual job-like page', async () => {
    document.body.innerHTML =
      '<main data-testid="job-description">' +
      '<h1>TypeScript Developer</h1>' +
      '<p>We are hiring candidates with TypeScript experience for a developer role. ' +
      'Responsibilities include building accessible interfaces, testing application behavior, ' +
      'and reviewing requirements. Applicants must verify all details before applying. ' +
      'This position supports manual review and reliable local testing workflows.</p>' +
      '</main>';
    await openInPageAssistant();
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;

    shadow?.querySelector<HTMLButtonElement>('[data-action="analyze-job"]')?.click();
    await flushAsyncWork();

    expect(shadow?.textContent).toContain('Local Job Match');
    expect(shadow?.textContent).toContain('Skills relevant to this role: TypeScript.');
    expect(shadow?.textContent).toContain('Nothing is sent to an AI provider');
  });

  it('copies supported wording only after a direct click', async () => {
    document.body.innerHTML =
      '<main data-testid="job-description"><h1>TypeScript Developer</h1>' +
      '<p>We are hiring candidates with TypeScript experience for this developer role. ' +
      'Responsibilities include writing tests, reviewing requirements, and improving application ' +
      'quality. The position requires careful manual review before any application is submitted.</p>' +
      '</main>';
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    await openInPageAssistant();
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>('[data-action="analyze-job"]')?.click();
    await flushAsyncWork();
    expect(writeText).not.toHaveBeenCalled();
    const copy = shadow?.querySelector<HTMLButtonElement>('[data-action="copy-suggestion"]');
    expect(copy).toBeTruthy();
    copy?.click();
    await flushAsyncWork();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('Skills relevant to this role: TypeScript.');
    expect(
      messages.some((message) => (message as { command?: string }).command === 'FILL_APPROVED_FIELDS')
    ).toBe(false);
  });

  it('records a manual skip without rewriting saved fill-preview evidence', async () => {
    document.body.innerHTML =
      '<main><h1>Developer Application</h1><form>' +
      '<label for="email">Email</label><input id="email" type="email" name="email" />' +
      '</form></main>';
    await openInPageAssistant();
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')?.click();
    await flushAsyncWork();

    const button = shadow?.querySelector<HTMLButtonElement>('[data-action="mark-skipped"]');
    expect(button).toBeTruthy();
    button?.click();
    await flushAsyncWork();

    const statusMessages = messages.filter(
      (message) =>
        (message as { command?: string; payload?: { status?: string } }).command ===
          'SAVE_APPLICATION_SESSION' &&
        (message as { payload?: { status?: string } }).payload?.status === 'skipped'
    );
    expect(statusMessages).toHaveLength(1);
    const payload = (statusMessages[0] as { payload: Record<string, unknown> }).payload;
    expect(payload).toHaveProperty('pageUrl');
    expect(payload).not.toHaveProperty('fieldPreview');
    expect(payload).not.toHaveProperty('fillResults');
  });

  it('does not mark an application submitted when confirmation is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    document.body.innerHTML =
      '<main><form><label for="email">Email</label><input id="email" type="email" /></form></main>';
    await openInPageAssistant();
    const shadow = document.getElementById('rapid-robot-job-assistant-root')?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>('[data-action="analyze-fields"]')?.click();
    await flushAsyncWork();
    expect(shadow?.querySelector('[data-action="mark-submitted"]')).toBeTruthy();
    shadow?.querySelector<HTMLButtonElement>('[data-action="mark-submitted"]')?.click();
    await flushAsyncWork();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(
      messages.some(
        (message) =>
          (message as { command?: string; payload?: { status?: string } }).command ===
            'SAVE_APPLICATION_SESSION' &&
          (message as { payload?: { status?: string } }).payload?.status === 'submitted-by-user'
      )
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
