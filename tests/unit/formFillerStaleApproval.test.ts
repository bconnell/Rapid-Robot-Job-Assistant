import { describe, expect, it } from 'vitest';
import { detectFormFields } from '../../src/content/formDetector';
import { fillApprovedFields } from '../../src/content/formFiller';
import type { FillPreviewItem } from '../../src/shared/models/FieldMapping';

function setLayout(selector: string, width = 100, height = 20) {
  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width, height }) as DOMRect
    });
  });
}

function analyzedPreview(selector: string, value: string): FillPreviewItem {
  setLayout(selector);
  const candidate = detectFormFields(document).find((field) => field.selector === selector);
  if (!candidate) throw new Error(`No analyzed field matched ${selector}`);

  return {
    candidate,
    kind: 'unknown',
    confidence: 1,
    sensitive: false,
    fillable: true,
    requiresDirectReview: false,
    value,
    approved: true,
    status: 'approved'
  };
}

describe('stale field approvals', () => {
  it('refuses when the accessible label changes after analysis', () => {
    document.body.innerHTML = '<label for="contact">Email</label><input id="contact" type="email">';
    const item = analyzedPreview('#contact', 'alex@example.test');
    document.querySelector('#contact')?.setAttribute('aria-label', 'Password');

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#contact')?.value).toBe('');
  });

  it('refuses to fill when classifier context is incomplete or missing', () => {
    document.body.innerHTML = '<label for="contact">Email</label><input id="contact" type="email">';
    const analyzed = analyzedPreview('#contact', 'alex@example.test');
    const incomplete: FillPreviewItem = {
      ...analyzed,
      candidate: { ...analyzed.candidate, classificationContextComplete: false }
    };
    const legacy: FillPreviewItem = {
      ...analyzed,
      candidate: { ...analyzed.candidate, classificationContextComplete: undefined }
    };

    const results = fillApprovedFields([incomplete, legacy], document);

    expect(results.every((result) => !result.ok)).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#contact')?.value).toBe('');
  });

  it('refuses a suffix-only sensitive label change beyond the reviewed text bound', () => {
    const reviewedLabel = `Email ${'x'.repeat(174)}`;
    expect(reviewedLabel.length).toBe(180);
    document.body.innerHTML = `<label for="contact">${reviewedLabel}</label><input id="contact" type="email">`;
    const item = analyzedPreview('#contact', 'alex@example.test');
    document.querySelector('label')!.textContent = `${reviewedLabel} Social Security Number`;

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#contact')?.value).toBe('');
  });

  it('rechecks later targets after earlier field events mutate the page', () => {
    document.body.innerHTML = '<input id="first"><input id="second">';
    const first = analyzedPreview('#first', 'Alex');
    const second = analyzedPreview('#second', 'alex@example.test');
    document.querySelector('#first')?.addEventListener('input', () => {
      document.querySelector('#second')?.setAttribute('aria-label', 'Different field');
    });

    const results = fillApprovedFields([first, second], document);

    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#second')?.value).toBe('');
  });

  it('refuses when the field moves into a different form context', () => {
    document.body.innerHTML = `
      <form id="application-one">
        <label for="contact">Email</label><input id="contact" type="email" name="email">
      </form>
      <form id="application-two"></form>`;
    const item = analyzedPreview('#contact', 'alex@example.test');
    document.querySelector('#application-two')?.append(document.querySelector('#contact')!);

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#contact')?.value).toBe('');
  });

  it('refuses when an analyzed select option changes its submitted value', () => {
    document.body.innerHTML = `
      <label for="state">State</label>
      <select id="state"><option value="">Select</option><option value="IL">Illinois</option></select>`;
    const item = analyzedPreview('#state', 'Illinois');
    const select = document.querySelector<HTMLSelectElement>('#state')!;
    const option = document.querySelector<HTMLOptionElement>('#state option:last-child')!;
    option.value = 'NY';
    let changeEvents = 0;
    select.addEventListener('change', () => (changeEvents += 1));

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(false);
    expect(changeEvents).toBe(0);
  });

  it('refuses a select option added after the reviewed option list was capped', () => {
    const options = Array.from(
      { length: 100 },
      (_, index) => `<option value="original-${index}">Original ${index}</option>`
    ).join('');
    document.body.innerHTML = `<label for="state">State</label><select id="state">${options}</select>`;
    const item = analyzedPreview('#state', 'unreviewed');
    const select = document.querySelector<HTMLSelectElement>('#state')!;
    select.add(new Option('Unreviewed option', 'unreviewed'));

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(false);
    expect(select.value).not.toBe('unreviewed');
  });

  it('refuses if the approved selector becomes ambiguous', () => {
    document.body.innerHTML = '<input id="contact" type="email">';
    const item = analyzedPreview('#contact', 'alex@example.test');
    document.body.insertAdjacentHTML('beforeend', '<input id="contact" type="email">');

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(false);
    expect(document.querySelectorAll<HTMLInputElement>('#contact')[0].value).toBe('');
    expect(document.querySelectorAll<HTMLInputElement>('#contact')[1].value).toBe('');
  });

  it('refuses a control made transparent after analysis', () => {
    document.body.innerHTML = '<input id="contact" type="email">';
    const item = analyzedPreview('#contact', 'alex@example.test');
    document.querySelector<HTMLInputElement>('#contact')!.style.opacity = '0';

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#contact')?.value).toBe('');
  });

  it('refuses a control with no rendered area after analysis', () => {
    document.body.innerHTML = '<input id="contact" type="email">';
    const item = analyzedPreview('#contact', 'alex@example.test');
    setLayout('#contact', 0, 0);

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#contact')?.value).toBe('');
  });
});
