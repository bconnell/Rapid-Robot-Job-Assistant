import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestCurrentSitePermissionFromUi } from '../../src/shared/extension/PermissionRequestClient';
import { preflightTab } from '../../src/shared/extension/TabPermissions';

describe('requestCurrentSitePermissionFromUi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'chrome');
  });

  it('requests only the current origin from a UI gesture helper', async () => {
    const request = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('chrome', { permissions: { request } });
    const status = preflightTab({ id: 1, url: 'https://company.example.com/careers/123' }, false);

    const result = await requestCurrentSitePermissionFromUi(status);

    expect(request).toHaveBeenCalledWith({ origins: ['https://company.example.com/*'] });
    expect(result).toMatchObject({
      granted: true,
      originPattern: 'https://company.example.com/*'
    });
    expect(result.userMessage).toContain('Permission granted');
  });

  it('handles denied permission without blocking one-off analysis wording', async () => {
    const request = vi.fn().mockResolvedValue(false);
    vi.stubGlobal('chrome', { permissions: { request } });
    const status = preflightTab({ id: 1, url: 'http://localhost:5173/fake-form' }, false);

    const result = await requestCurrentSitePermissionFromUi(status);

    expect(request).toHaveBeenCalledWith({ origins: ['http://localhost:5173/*'] });
    expect(result.granted).toBe(false);
    expect(result.userMessage).toContain('one-off analysis');
  });

  it('does not request permission for blocked pages', async () => {
    const request = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('chrome', { permissions: { request } });
    const status = preflightTab({ id: 1, url: 'chrome://extensions' }, false);

    const result = await requestCurrentSitePermissionFromUi(status);

    expect(request).not.toHaveBeenCalled();
    expect(result.granted).toBe(false);
  });
});
