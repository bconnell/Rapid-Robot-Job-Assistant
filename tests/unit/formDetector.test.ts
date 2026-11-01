import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { detectApplicationIframeWarnings, detectFormFields } from '../../src/content/formDetector';
import { maxFillItems } from '../../src/shared/extension/PageCommandIntegrity';

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
    expect(firstName?.classificationContextComplete).toBe(true);
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
  it('treats controls inside hidden and disabled ancestors as manual-only candidates', () => {
    document.body.innerHTML = `
      <section hidden><label>Email <input id="hidden-email" type="email" /></label></section>
      <fieldset disabled><label>Phone <input id="disabled-phone" type="tel" /></label></fieldset>`;

    const fields = detectFormFields(document);
    expect(fields.find((field) => field.id === 'hidden-email')?.visible).toBe(false);
    expect(fields.find((field) => field.id === 'disabled-phone')?.disabled).toBe(true);
  });

  it('keeps same-name choice groups in separate forms isolated', () => {
    document.body.innerHTML = `
      <form id="first-form">
        <label><input type="radio" name="answer" value="yes" /> Yes</label>
        <label><input type="radio" name="answer" value="no" /> No</label>
      </form>
      <form id="second-form">
        <label><input type="radio" name="answer" value="remote" /> Remote</label>
        <label><input type="radio" name="answer" value="onsite" /> Onsite</label>
      </form>`;

    const fields = detectFormFields(document).filter(
      (field) => field.controlFamily === 'radio-group'
    );
    expect(fields).toHaveLength(2);
    expect(fields[0].selector).toContain('#first-form');
    expect(fields[1].selector).toContain('#second-form');
  });

  it('keeps multiple select controls manual-only', () => {
    document.body.innerHTML = `
      <label for="locations">Preferred locations</label>
      <select id="locations" multiple>
        <option value="remote">Remote</option>
        <option value="hybrid">Hybrid</option>
      </select>`;

    const [field] = detectFormFields(document);
    expect(field.controlFamily).toBe('native-multi-select');
  });

  it('bounds detected fields without cloning the shared page container', () => {
    const container = document.createElement('div');
    container.append(document.createTextNode('Application context. '.repeat(20)));

    for (let index = 0; index < maxFillItems + 10; index += 1) {
      const input = document.createElement('input');
      input.id = `application-field-${index}`;
      container.append(input);
    }

    document.body.replaceChildren(container);
    const cloneNode = vi.spyOn(HTMLElement.prototype, 'cloneNode');
    const querySelectorAll = vi.spyOn(Document.prototype, 'querySelectorAll');

    try {
      const fields = detectFormFields(document);

      expect(fields).toHaveLength(maxFillItems + 1);
      expect(fields.truncated).toBe(true);
      expect(cloneNode).not.toHaveBeenCalled();
      expect(querySelectorAll).not.toHaveBeenCalled();
    } finally {
      cloneNode.mockRestore();
      querySelectorAll.mockRestore();
    }
  });

  it('reports truncation after a fixed DOM scan budget even when no fields match', () => {
    const container = document.createElement('div');
    for (let index = 0; index < 10_050; index += 1) {
      container.append(document.createElement('span'));
    }
    document.body.replaceChildren(container);

    const fields = detectFormFields(document);

    expect(fields).toHaveLength(0);
    expect(fields.truncated).toBe(true);
  });

  it('bounds label text traversal through large element-only subtrees', () => {
    const label = document.createElement('label');
    label.htmlFor = 'contact';
    for (let index = 0; index < 500; index += 1) {
      label.append(document.createElement('span'));
    }
    const input = document.createElement('input');
    input.id = 'contact';
    document.body.replaceChildren(label, input);
    const matches = vi.spyOn(Element.prototype, 'matches');

    try {
      const fields = detectFormFields(document);

      const textTraversalCalls = matches.mock.calls.filter(
        ([selector]) => selector === 'input, textarea, select, option, script, style'
      );
      expect(textTraversalCalls.length).toBeLessThan(1_000);
      expect(fields[0]?.classificationContextComplete).toBe(false);
    } finally {
      matches.mockRestore();
    }
  });

  it('marks a field incomplete when a sensitive label suffix is beyond the text bound', () => {
    document.body.innerHTML = `<form><label for="contact">Email ${'x'.repeat(180)} Social Security Number</label><input id="contact" type="email" autocomplete="email" /></form>`;

    const [field] = detectFormFields(document);

    expect(field?.labelText).not.toContain('Social Security Number');
    expect(field?.classificationContextComplete).toBe(false);
  });

  it('keeps a label exactly at the text bound complete when no more label text follows', () => {
    document.body.innerHTML = `<form><label for="contact">Email ${'x'.repeat(174)}</label><input id="contact" type="email" autocomplete="email" /></form>`;

    const [field] = detectFormFields(document);

    expect(field?.labelText).toHaveLength(180);
    expect(field?.classificationContextComplete).toBe(true);
  });

  it('marks referenced and grouped context incomplete when classifier text is truncated', () => {
    document.body.innerHTML = `
      <form>
        <span id="description">${'x'.repeat(180)} Social Security Number</span>
        <input id="described" aria-describedby="description" />
        <fieldset>
          <legend>${'Eligibility '.repeat(20)} Social Security Number</legend>
          <label><input type="radio" name="authorization" value="yes" /> Yes</label>
          <label><input type="radio" name="authorization" value="no" /> No</label>
        </fieldset>
      </form>`;

    const fields = detectFormFields(document);
    const described = fields.find((field) => field.id === 'described');
    const group = fields.find((field) => field.controlFamily === 'radio-group');

    expect(described?.classificationContextComplete).toBe(false);
    expect(group?.classificationContextComplete).toBe(false);
  });
});
