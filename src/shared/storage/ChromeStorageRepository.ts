import { STORAGE_KEYS } from './StorageKeys';

export interface ExtensionSettings {
  localOnlyMode: boolean;
  aiEnabled: boolean;
  aiProvider: 'manual' | 'openai-compatible' | 'ollama';
  aiEndpoint?: string;
  manualReviewRequired: boolean;
}

export const defaultSettings: ExtensionSettings = {
  localOnlyMode: true,
  aiEnabled: false,
  aiProvider: 'manual',
  manualReviewRequired: true
};

export class ChromeStorageRepository {
  async getSettings(): Promise<ExtensionSettings> {
    if (!globalThis.chrome?.storage?.local) {
      return defaultSettings;
    }
    const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
    return { ...defaultSettings, ...(result[STORAGE_KEYS.settings] as Partial<ExtensionSettings>) };
  }

  async saveSettings(settings: ExtensionSettings): Promise<void> {
    if (!globalThis.chrome?.storage?.local) {
      return;
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
  }

  async clearSettings(): Promise<void> {
    if (!globalThis.chrome?.storage?.local) {
      return;
    }
    await chrome.storage.local.remove([STORAGE_KEYS.settings, STORAGE_KEYS.activeProfileId]);
  }
}
