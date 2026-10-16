import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OptionsApp } from '../../src/options/OptionsApp';
import { clearAllIndexedDbData } from '../../src/shared/storage/IndexedDbRepository';
import {
  ApplicationSessionRepository,
  JobPostingRepository
} from '../../src/shared/storage/TypedRepositories';
import type { ApplicationSession } from '../../src/shared/models/ApplicationSession';
import type { JobPosting } from '../../src/shared/models/JobPosting';

let mount: HTMLDivElement;
let root: Root | undefined;
const openTab = vi.fn().mockResolvedValue({ id: 11 });

const job: JobPosting = {
  id: 'synthetic-history-job',
  title: 'Example Support Developer',
  company: 'Example Company',
  descriptionText: 'Synthetic local test job description.',
  detectedKeywords: ['TypeScript'],
  sourceUrl: 'https://jobs.example.test/role/history',
  sourceSite: 'jobs.example.test',
  dateFound: '2026-10-15T00:00:00.000Z',
  status: 'saved'
};

const session: ApplicationSession = {
  id: 'synthetic-history-session',
  pageUrl: 'https://jobs.example.test/apply/history',
  startedAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
  fieldPreview: [],
  fillResults: [],
  manualVerificationRequired: false,
  notes: 'Synthetic note',
  status: 'draft',
  submittedByUser: false
};

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('chrome', {
    runtime: { id: 'fake-extension' },
    tabs: { create: openTab },
    storage: { local: { get: vi.fn().mockResolvedValue({}) } }
  });
  openTab.mockClear();
  await clearAllIndexedDbData();
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
  vi.unstubAllGlobals();
});

describe('Options local job and application history', () => {
  it('shows saved records and opens them only when the user clicks', async () => {
    await new JobPostingRepository().save(job);
    await new ApplicationSessionRepository().save(session);
    root = createRoot(mount);
    await act(async () => {
      root?.render(createElement(OptionsApp));
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mount.textContent).toContain('Saved Jobs and Applications');
    expect(mount.textContent).toContain('Example Support Developer');
    expect(mount.textContent).toContain('Synthetic note');
    expect(openTab).not.toHaveBeenCalled();

    const openPosting = [...mount.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Open Job Posting')
    );
    expect(openPosting).toBeTruthy();
    await act(async () => {
      openPosting?.click();
      await Promise.resolve();
    });
    expect(openTab).toHaveBeenCalledWith({
      url: 'https://jobs.example.test/role/history',
      active: true
    });
  });
});
