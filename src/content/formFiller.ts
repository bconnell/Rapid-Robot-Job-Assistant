import type { FillPreviewItem, FillResult } from '../shared/models/FieldMapping';
import { normalizeWhitespace } from '../shared/utils/Validation';

export function fillApprovedFields(
  preview: FillPreviewItem[],
  doc: Document = document
): FillResult[] {
  return preview.filter((item) => item.approved).map((item) => fillField(item, doc));
}

function fillField(item: FillPreviewItem, doc: Document): FillResult {
  if (!item.value) return fail(item, 'No value provided.');
  if (!item.candidate.visible) return fail(item, 'Hidden fields are not filled.');
  if (item.candidate.disabled) return fail(item, 'Disabled fields are not filled.');
  if (item.candidate.readOnly) return fail(item, 'Read-only fields are not filled.');
  if (item.candidate.stableSelector === false) {
    return fail(item, 'Field needs manual review because a stable selector was not found.');
  }
  if (
    item.candidate.controlFamily === 'aria-combobox' ||
    item.candidate.controlFamily === 'custom-select' ||
    item.candidate.controlFamily === 'unknown-widget' ||
    item.candidate.candidateSource === 'aria-widget'
  ) {
    return fail(item, 'Custom widgets are manual-only in this version.');
  }

  const element = doc.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    item.candidate.selector
  );
  if (!element) return fail(item, 'Field not found.');
  if (isElementDisabledOrReadOnly(element)) return fail(item, 'Field is not editable.');

  if (element instanceof HTMLInputElement && element.type === 'file') {
    return fail(item, 'File uploads require manual selection.');
  }

  if (element instanceof HTMLSelectElement) return fillSelect(item, element);
  if (element instanceof HTMLInputElement && element.type === 'radio') {
    return fillRadioGroup(item, doc);
  }
  if (element instanceof HTMLInputElement && element.type === 'checkbox') {
    return fillCheckbox(item, doc);
  }

  setNativeValue(element, item.value);
  dispatchFieldEvents(element);
  return ok(item, 'Filled approved field.');
}

function fillSelect(item: FillPreviewItem, element: HTMLSelectElement): FillResult {
  const option = findMatchingOption(Array.from(element.options), item.value ?? '');
  if (!option) return fail(item, 'No matching select option. Review this field manually.');
  element.value = option.value;
  dispatchFieldEvents(element);
  return ok(item, 'Selected approved option.');
}

function fillRadioGroup(item: FillPreviewItem, doc: Document): FillResult {
  const radios = getGroupedInputs(item, doc, 'radio');
  const match = radios.find((radio) => optionMatches(radio, item.value ?? '', doc));
  if (!match) return fail(item, 'No matching radio option. Review this field manually.');
  match.checked = true;
  dispatchFieldEvents(match);
  return ok(item, 'Selected approved radio option.');
}

function fillCheckbox(item: FillPreviewItem, doc: Document): FillResult {
  const boxes = getGroupedInputs(item, doc, 'checkbox');
  const values = splitRequestedValues(item.value ?? '');
  if (boxes.length === 1 && isYesNo(values)) {
    boxes[0].checked = ['yes', 'true', '1'].includes(values[0]);
    dispatchFieldEvents(boxes[0]);
    return ok(item, 'Updated approved checkbox.');
  }

  const matched = boxes.filter((box) => values.some((value) => optionMatches(box, value, doc)));
  if (matched.length === 0) {
    return fail(item, 'No matching checkbox option. Review this field manually.');
  }
  matched.forEach((box) => {
    box.checked = true;
    dispatchFieldEvents(box);
  });
  return ok(item, 'Updated approved checkbox option.');
}

function getGroupedInputs(
  item: FillPreviewItem,
  doc: Document,
  type: 'radio' | 'checkbox'
): HTMLInputElement[] {
  const name = item.candidate.name;
  if (name) {
    return Array.from(
      doc.querySelectorAll<HTMLInputElement>(`input[type="${type}"][name="${escapeCss(name)}"]`)
    );
  }
  const element = doc.querySelector<HTMLInputElement>(item.candidate.selector);
  return element ? [element] : [];
}

function findMatchingOption(
  options: HTMLOptionElement[],
  value: string
): HTMLOptionElement | undefined {
  const requested = normalizeOption(value);
  return options.find((option) => {
    const optionValue = normalizeOption(option.value);
    const optionLabel = normalizeOption(option.textContent ?? '');
    if (optionValue === requested || optionLabel === requested) return true;
    if (isYesNo([requested])) {
      return (
        yesNoAliases(requested).includes(optionValue) ||
        yesNoAliases(requested).includes(optionLabel)
      );
    }
    return false;
  });
}

function optionMatches(input: HTMLInputElement, value: string, doc: Document): boolean {
  const requested = normalizeOption(value);
  const label = normalizeOption(findInputLabel(input, doc) ?? '');
  const inputValue = normalizeOption(input.value);
  return (
    inputValue === requested || label === requested || yesNoAliases(requested).includes(inputValue)
  );
}

function findInputLabel(input: HTMLInputElement, doc: Document): string | undefined {
  const explicit = input.id ? doc.querySelector(`label[for="${escapeCss(input.id)}"]`) : undefined;
  const wrapping = input.closest('label');
  return normalizeWhitespace(explicit?.textContent ?? wrapping?.textContent ?? '') || undefined;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  if (!descriptor?.set) element.value = value;
}

function dispatchFieldEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function isElementDisabledOrReadOnly(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): boolean {
  return (
    element.disabled ||
    ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
      element.readOnly)
  );
}

function splitRequestedValues(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map(normalizeOption)
    .filter(Boolean);
}

function normalizeOption(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function isYesNo(values: string[]): boolean {
  return values.length === 1 && ['yes', 'no', 'true', 'false', '1', '0'].includes(values[0]);
}

function yesNoAliases(value: string): string[] {
  if (['yes', 'true', '1'].includes(value)) return ['yes', 'true', '1', 'y'];
  if (['no', 'false', '0'].includes(value)) return ['no', 'false', '0', 'n'];
  return [];
}

function ok(item: FillPreviewItem, message: string): FillResult {
  return { selector: item.candidate.selector, ok: true, message };
}

function fail(item: FillPreviewItem, message: string): FillResult {
  return { selector: item.candidate.selector, ok: false, message };
}

function escapeCss(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\#.;:[\],>+~*'=]/g, '\\$&');
}
