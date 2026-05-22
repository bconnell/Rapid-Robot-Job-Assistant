import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFormFields } from '../../src/content/formDetector';
import { mapFieldCandidates } from '../../src/content/fieldMapper';

describe('field mapping', () => {
  it('maps classic contact fields with high confidence', () => {
    document.body.innerHTML = readFileSync(
      resolve('tests/fixtures/application-forms/fake-classic-form.html'),
      'utf8'
    );
    const mappings = mapFieldCandidates(detectFormFields(document));

    expect(
      mappings.find((mapping) => mapping.kind === 'firstName')?.confidence
    ).toBeGreaterThanOrEqual(0.9);
    expect(mappings.find((mapping) => mapping.kind === 'email')?.fillable).toBe(true);
  });

  it('requires review for sensitive fields', () => {
    document.body.innerHTML = readFileSync(
      resolve('tests/fixtures/application-forms/fake-sensitive-fields-form.html'),
      'utf8'
    );
    const mappings = mapFieldCandidates(detectFormFields(document));

    expect(mappings.every((mapping) => mapping.sensitive)).toBe(true);
    expect(mappings.every((mapping) => mapping.requiresDirectReview)).toBe(true);
  });

  it('keeps file uploads manual and explains eligibility mappings', () => {
    document.body.innerHTML = readFileSync(
      resolve('tests/fixtures/application-forms/fake-advanced-form.html'),
      'utf8'
    );
    const mappings = mapFieldCandidates(detectFormFields(document));

    expect(mappings.find((mapping) => mapping.kind === 'resumeUpload')?.fillable).toBe(false);
    expect(mappings.find((mapping) => mapping.kind === 'workAuthorization')?.sensitive).toBe(true);
    expect(mappings.find((mapping) => mapping.kind === 'earliestStartDate')?.explanation).toContain(
      'earliestStartDate'
    );
  });
});
