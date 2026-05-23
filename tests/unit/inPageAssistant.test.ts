import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeInPageAssistant,
  getInPageAssistantStatus,
  openInPageAssistant,
  toggleInPageAssistant
} from '../../src/content/inPageAssistant/InPageAssistantController';

describe('InPageAssistantController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.querySelector('#rapid-robot-job-assistant-root')?.remove();
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'fake-extension',
        sendMessage: vi.fn().mockResolvedValue({ ok: true, data: undefined })
      }
    });
  });

  it('opens one floating assistant and restores existing widget without duplicates', async () => {
    await openInPageAssistant();
    await openInPageAssistant();

    expect(document.querySelectorAll('#rapid-robot-job-assistant-root')).toHaveLength(1);
    expect(getInPageAssistantStatus()).toEqual({ open: true, minimized: false });
  });

  it('toggles and closes the assistant', async () => {
    await openInPageAssistant();
    await toggleInPageAssistant();

    expect(getInPageAssistantStatus()).toEqual({ open: true, minimized: true });
    expect(closeInPageAssistant()).toEqual({ closed: true });
    expect(getInPageAssistantStatus()).toEqual({ open: false, minimized: false });
  });

  it('renders safety and primary action copy', async () => {
    await openInPageAssistant();
    const root = document.getElementById('rapid-robot-job-assistant-root');
    const text = root?.shadowRoot?.textContent ?? '';

    expect(text).toContain('Rapid Robot Job Assistant');
    expect(text).toContain('Analyze Job');
    expect(text).toContain('No auto-submit');
    expect(text).toContain('Submit manually');
  });
});
