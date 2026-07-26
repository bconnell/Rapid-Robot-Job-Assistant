import { describe, expect, it, vi } from 'vitest';
import { analyzeApplicationFields } from '../../src/content/pageAnalyzer';
import {
  isValidFillPreviewArray,
  isValidFillResultArray,
  maxFillItems
} from '../../src/shared/extension/PageCommandIntegrity';
import { isCompleteApprovedFill } from '../../src/shared/fill/FillApprovalRules';
import { createSavedSearch } from '../../src/shared/jobs/SavedSearchService';
import type { FillPreviewItem } from '../../src/shared/models/FieldMapping';
import {
  ChromeStorageRepository,
  defaultSettings
} from '../../src/shared/storage/ChromeStorageRepository';

function preview(selector = '#name'): FillPreviewItem {
  return {
    candidate: {
      selector,
      tagName: 'input',
      inputType: 'text',
      options: [],
      required: false,
      visible: true,
      stableSelector: true
    },
    kind: 'fullName',
    confidence: 0.95,
    sensitive: false,
    fillable: true,
    requiresDirectReview: false,
    value: 'Alex Morgan',
    approved: true,
    status: 'approved'
  };
}

describe('state persistence and boundary hardening', () => {
  it('rejects malformed preview enums and non-boolean candidate flags', () => {
    expect(isValidFillPreviewArray([{ ...preview(), status: 'invented' }])).toBe(false);
    expect(
      isValidFillPreviewArray([
        {
          ...preview(),
          candidate: { ...preview().candidate, disabled: 'false' }
        }
      ])
    ).toBe(false);
  });

  it('rejects duplicate fill results and incomplete result sets', () => {
    const results = [
      { selector: '#name', ok: true, message: 'Filled' },
      { selector: '#name', ok: true, message: 'Filled twice' }
    ];
    expect(isValidFillResultArray(results)).toBe(false);
    expect(isCompleteApprovedFill([preview()], results)).toBe(false);
    expect(
      isCompleteApprovedFill(
        [preview()],
        [{ selector: '#other', ok: true, message: 'Wrong field' }]
      )
    ).toBe(false);
  });

  it('normalizes saved-search URLs and rejects embedded credentials', () => {
    const search = createSavedSearch({
      label: 'Jobs',
      url: 'https://jobs.example.test/search?q=dev&utm_source=test#results',
      keywords: ['React', ' React ']
    });
    expect(search.url).toBe('https://jobs.example.test/search?q=dev');
    expect(search.keywords).toEqual(['React']);
    expect(() =>
      createSavedSearch({
        label: 'Unsafe',
        url: 'https://user:secret@jobs.example.test/search'
      })
    ).toThrow(/credentials/i);
  });

  it('forces safe local settings when stored values are malformed or stale', async () => {
    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: vi.fn(async () => ({
              'rrja.settings': {
                localOnlyMode: false,
                aiEnabled: true,
                aiProvider: 'openai-compatible',
                manualReviewRequired: false
              }
            })),
            set: vi.fn(async () => undefined)
          }
        }
      }
    });
    const repo = new ChromeStorageRepository();
    expect(await repo.getSettings()).toEqual(defaultSettings);
  });

  it('caps field analysis at the persisted fill boundary', () => {
    document.body.innerHTML = `<form>${Array.from(
      { length: maxFillItems + 5 },
      (_, index) => `<input id="field-${index}" />`
    ).join('')}</form>`;
    const result = analyzeApplicationFields();
    expect(result.fieldCount).toBe(maxFillItems);
    expect(result.warnings.join(' ')).toMatch(/first 500/i);
  });
});
