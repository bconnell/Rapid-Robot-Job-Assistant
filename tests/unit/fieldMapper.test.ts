import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFormFields } from '../../src/content/formDetector';
import { mapFieldCandidates } from '../../src/content/fieldMapper';
import { approveSafeHighConfidence } from '../../src/shared/fill/FillApprovalRules';
import type { FillPreviewItem } from '../../src/shared/models/FieldMapping';

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

  it('keeps select controls manual when their option list exceeds the reviewed bound', () => {
    document.body.innerHTML = `<label for="state">State</label><select id="state">${Array.from(
      { length: 101 },
      (_, index) => `<option value="state-${index}">State ${index}</option>`
    ).join('')}</select>`;
    const mapping = mapFieldCandidates(detectFormFields(document))[0];

    expect(mapping.fillable).toBe(false);
    expect(mapping.requiresDirectReview).toBe(true);
    expect(mapping.warning).toContain('select option list');
  });

  it('keeps incomplete and legacy field context manual-only', () => {
    const candidates = [
      {
        selector: '#incomplete',
        inputType: 'email',
        tagName: 'input',
        labelText: 'Email',
        options: [],
        required: false,
        visible: true,
        classificationContextComplete: false
      },
      {
        selector: '#legacy',
        inputType: 'email',
        tagName: 'input',
        labelText: 'Email',
        options: [],
        required: false,
        visible: true
      }
    ];

    const mappings = mapFieldCandidates(candidates);

    expect(mappings.every((mapping) => !mapping.fillable)).toBe(true);
    expect(mappings.every((mapping) => mapping.requiresDirectReview)).toBe(true);
    expect(mappings[0]?.warning).toContain('context is incomplete');
  });

  it('does not bulk-approve a preview with incomplete or missing context state', () => {
    const makePreview = (
      classificationContextComplete: boolean | undefined,
      selector: string
    ): FillPreviewItem => ({
      candidate: {
        selector,
        inputType: 'email',
        tagName: 'input',
        labelText: 'Email',
        options: [],
        required: false,
        visible: true,
        ...(classificationContextComplete === undefined ? {} : { classificationContextComplete })
      },
      kind: 'email',
      confidence: 1,
      sensitive: false,
      fillable: true,
      requiresDirectReview: false,
      value: 'alex@example.test',
      approved: false,
      status: 'pending'
    });

    const result = approveSafeHighConfidence([
      makePreview(false, '#incomplete'),
      makePreview(undefined, '#legacy')
    ]);

    expect(result.every((item) => !item.approved)).toBe(true);
  });
});
