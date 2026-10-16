import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeSendBackgroundMessage } from '../../src/shared/extension/SafeBackgroundCommand';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safe background messaging', () => {
  it('returns successful responses unchanged', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true, data: { count: 2 } }) }
    });
    expect(await safeSendBackgroundMessage({ command: 'GET_CURRENT_TAB_STATUS' })).toEqual({
      ok: true,
      data: { count: 2 }
    });
  });

  it('turns worker rejection into a failure without retrying or leaking errors', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('Private error details'));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const response = await safeSendBackgroundMessage({ command: 'FILL_APPROVED_FIELDS' });
    expect(response.ok).toBe(false);
    expect(response.userMessage).toMatch(/background process is unavailable/i);
    expect(response.userMessage).not.toContain('Private error details');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed worker responses', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: 'true' }) }
    });
    expect(
      (await safeSendBackgroundMessage({ command: 'ANALYZE_CURRENT_JOB_PAGE' })).ok
    ).toBe(false);
  });
});
