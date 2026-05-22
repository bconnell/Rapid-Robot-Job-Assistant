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

  it('maps grouped eligibility fields without relying on weak words alone', () => {
    document.body.innerHTML = readFileSync(
      resolve('tests/fixtures/application-forms/grouped-radio-checkbox-form.html'),
      'utf8'
    );
    const mappings = mapFieldCandidates(detectFormFields(document));

    expect(mappings.find((mapping) => mapping.kind === 'workAuthorization')?.sensitive).toBe(true);
    expect(mappings.find((mapping) => mapping.kind === 'sponsorship')?.requiresDirectReview).toBe(
      true
    );
    expect(
      mappings.find((mapping) => mapping.kind === 'remotePreference')?.confidence
    ).toBeGreaterThanOrEqual(0.7);
  });

  it('does not confuse statement with state or weak work text with authorization', () => {
    document.body.innerHTML = readFileSync(
      resolve('tests/fixtures/application-forms/disabled-readonly-hidden-fields-form.html'),
      'utf8'
    );
    const mappings = mapFieldCandidates(detectFormFields(document));

    expect(mappings.find((mapping) => mapping.candidate.name === 'personalStatement')?.kind).toBe(
      'unknown'
    );
    expect(
      mapFieldCandidates([
        {
          selector: '#work-style',
          inputType: 'text',
          tagName: 'input',
          labelText: 'Preferred work style',
          options: [],
          required: false,
          visible: true
        }
      ])[0].kind
    ).not.toBe('workAuthorization');
  });

  it('keeps custom widgets and voluntary disclosure fields manual or direct-review only', () => {
    document.body.innerHTML = readFileSync(
      resolve('tests/fixtures/application-forms/custom-dropdown-form.html'),
      'utf8'
    );
    const customMapping = mapFieldCandidates(detectFormFields(document))[0];
    expect(customMapping.fillable).toBe(false);
    expect(customMapping.warning).toContain('Custom');

    document.body.innerHTML = readFileSync(
      resolve('tests/fixtures/application-forms/sensitive-voluntary-disclosures-form.html'),
      'utf8'
    );
    const sensitiveMappings = mapFieldCandidates(detectFormFields(document));
    expect(sensitiveMappings.every((mapping) => mapping.sensitive)).toBe(true);
    expect(sensitiveMappings.every((mapping) => !mapping.fillable)).toBe(true);
  });
});
