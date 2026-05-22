import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectApplicationIframeWarnings, detectFormFields } from '../../src/content/formDetector';

function loadFixture(name: string) {
  document.body.innerHTML = readFileSync(
    resolve(`tests/fixtures/application-forms/${name}`),
    'utf8'
  );
}

describe('form detector', () => {
  it('detects native labels, autocomplete, and select option values', () => {
    loadFixture('simple-company-form.html');

    const fields = detectFormFields(document);
    const firstName = fields.find((field) => field.id === 'first-name');
    const state = fields.find((field) => field.id === 'state');

    expect(firstName?.labelText).toBe('First name');
    expect(firstName?.autocomplete).toBe('given-name');
    expect(state?.options).toContain('Illinois');
    expect(state?.optionValues).toContain('IL');
  });

  it('detects aria-labelledby fields and file uploads', () => {
    loadFixture('modern-react-style-form.html');

    const fields = detectFormFields(document);
    expect(fields.find((field) => field.name === 'candidateLinkedIn')?.ariaLabelledBy).toBe(
      'LinkedIn profile'
    );
    expect(fields.find((field) => field.name === 'coverLetter')?.controlFamily).toBe('file-upload');
  });

  it('groups radio buttons and checkbox sets', () => {
    loadFixture('grouped-radio-checkbox-form.html');

    const fields = detectFormFields(document);
    const workAuth = fields.find((field) => field.name === 'workAuth');
    const workLocation = fields.find((field) => field.name === 'workLocation');

    expect(workAuth?.controlFamily).toBe('radio-group');
    expect(workAuth?.options).toEqual(['Yes', 'No']);
    expect(workLocation?.controlFamily).toBe('checkbox-group');
    expect(workLocation?.options).toContain('Remote');
  });

  it('marks disabled readonly and hidden fields as not directly fillable candidates', () => {
    loadFixture('disabled-readonly-hidden-fields-form.html');

    const fields = detectFormFields(document);
    expect(fields.find((field) => field.id === 'disabled-email')?.disabled).toBe(true);
    expect(fields.find((field) => field.id === 'readonly-phone')?.readOnly).toBe(true);
    expect(fields.find((field) => field.id === 'hidden-city')?.visible).toBe(false);
  });

  it('detects custom comboboxes and iframe application warnings', () => {
    loadFixture('custom-dropdown-form.html');
    expect(
      detectFormFields(document).find((field) => field.role === 'combobox')?.controlFamily
    ).toBe('aria-combobox');

    loadFixture('iframe-application-shell.html');
    expect(detectApplicationIframeWarnings(document)[0]).toContain('iframe');
  });

  it('marks duplicate weak selectors as unstable instead of pretending they are safe', () => {
    document.body.innerHTML = `
      <form>
        <input name="candidate" placeholder="Full name" />
        <input name="candidate" placeholder="Email" />
      </form>`;

    const fields = detectFormFields(document);

    expect(fields.every((field) => field.stableSelector === false)).toBe(true);
  });
});
