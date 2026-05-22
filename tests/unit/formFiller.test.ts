import { describe, expect, it } from 'vitest';
import { fillApprovedFields } from '../../src/content/formFiller';
import type { FillPreviewItem } from '../../src/shared/models/FieldMapping';

function preview(selector: string, value: string, inputType = 'text'): FillPreviewItem {
  return {
    candidate: {
      selector,
      inputType,
      tagName: 'input',
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
    value,
    approved: true,
    status: 'approved'
  };
}

describe('form filler', () => {
  it('updates text inputs with native setter events', () => {
    document.body.innerHTML = '<input id="name" />';
    const input = document.querySelector<HTMLInputElement>('#name')!;
    let inputEvents = 0;
    input.addEventListener('input', () => (inputEvents += 1));

    const [result] = fillApprovedFields([preview('#name', 'Alex Morgan')], document);

    expect(result.ok).toBe(true);
    expect(input.value).toBe('Alex Morgan');
    expect(inputEvents).toBe(1);
  });

  it('matches select options by normalized label and value', () => {
    document.body.innerHTML = `
      <select id="state">
        <option value="">Select</option>
        <option value="IL">Illinois</option>
      </select>`;

    const [result] = fillApprovedFields([preview('#state', ' illinois ')], document);

    expect(result.ok).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#state')?.value).toBe('IL');
  });

  it('fills one matching radio option', () => {
    document.body.innerHTML = `
      <label><input id="yes" type="radio" name="workAuth" value="yes" /> Yes</label>
      <label><input id="no" type="radio" name="workAuth" value="no" /> No</label>`;
    const item = preview('input[name="workAuth"]', 'No', 'radio');
    item.candidate.name = 'workAuth';
    item.candidate.controlFamily = 'radio-group';

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#no')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#yes')?.checked).toBe(false);
  });

  it('fills checkbox groups only when options match', () => {
    document.body.innerHTML = `
      <label><input id="remote" type="checkbox" name="location" value="remote" /> Remote</label>
      <label><input id="hybrid" type="checkbox" name="location" value="hybrid" /> Hybrid</label>`;
    const item = preview('input[name="location"]', 'Remote, Hybrid', 'checkbox');
    item.candidate.name = 'location';
    item.candidate.controlFamily = 'checkbox-group';

    const [result] = fillApprovedFields([item], document);

    expect(result.ok).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#remote')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#hybrid')?.checked).toBe(true);
  });

  it('refuses disabled readonly hidden file and custom widget fields', () => {
    document.body.innerHTML = '<input id="disabled" disabled /><input id="resume" type="file" />';
    const disabled = preview('#disabled', 'Alex Morgan');
    disabled.candidate.disabled = true;
    const file = preview('#resume', 'resume.pdf', 'file');
    file.candidate.controlFamily = 'file-upload';
    const custom = preview('#custom', 'Bachelor');
    custom.candidate.controlFamily = 'aria-combobox';

    const results = fillApprovedFields([disabled, file, custom], document);

    expect(results.every((result) => !result.ok)).toBe(true);
  });
});
