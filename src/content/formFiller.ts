import type { FillPreviewItem, FillResult } from '../shared/models/FieldMapping';
import { normalizeWhitespace } from '../shared/utils/Validation';

export function fillApprovedFields(
  preview: FillPreviewItem[],
  doc: Document = document
): FillResult[] {
  return preview.filter((item) => item.approved).map((item) => fillField(item, doc));
}

function fillField(item: FillPreviewItem, doc: Document): FillResult {
  if (!item.approved || item.rejected) return fail(item, 'Field is not currently approved.');
  if (!item.fillable) return fail(item, 'Field is not eligible for reviewed filling.');
  if (item.sensitive) return fail(item, 'Sensitive fields require manual entry.');
  if (!item.value?.trim()) return fail(item, 'No value provided.');
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

  const element = safeQuerySelector(doc, item.candidate.selector);
  if (!element) return fail(item, 'Field not found.');
  if (!matchesCandidateIdentity(item, element)) {
    return fail(item, 'Field identity changed after analysis. Analyze fields again.');
  }
  if (!isElementVisibleNow(element)) {
    return fail(item, 'Field is currently hidden. Analyze fields again.');
  }
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
  return element.value === item.value
    ? ok(item, 'Filled approved field.')
    : fail(item, 'The page rejected the approved value. Review this field manually.');
}

function fillSelect(item: FillPreviewItem, element: HTMLSelectElement): FillResult {
  const option = findMatchingOption(Array.from(element.options), item.value ?? '');
  if (!option) return fail(item, 'No matching select option. Review this field manually.');
  setNativeSelectValue(element, option.value);
  dispatchFieldEvents(element);
  return element.value === option.value
    ? ok(item, 'Selected approved option.')
    : fail(item, 'The page rejected the approved option. Review this field manually.');
}

function fillRadioGroup(item: FillPreviewItem, doc: Document): FillResult {
  const radios = getGroupedInputs(item, doc, 'radio').filter(isEditableChoice);
  const match = radios.find((radio) => optionMatches(radio, item.value ?? '', doc));
  if (!match) return fail(item, 'No editable matching radio option. Review this field manually.');
  setNativeChecked(match, true);
  dispatchFieldEvents(match);
  return match.checked
    ? ok(item, 'Selected approved radio option.')
    : fail(item, 'The page rejected the approved radio option.');
}

function fillCheckbox(item: FillPreviewItem, doc: Document): FillResult {
  const boxes = getGroupedInputs(item, doc, 'checkbox').filter(isEditableChoice);
  const values = splitRequestedValues(item.value ?? '');
  if (boxes.length === 1 && isYesNo(values)) {
    const checked = ['yes', 'true', '1'].includes(values[0]);
    setNativeChecked(boxes[0], checked);
    dispatchFieldEvents(boxes[0]);
    return boxes[0].checked === checked
      ? ok(item, 'Updated approved checkbox.')
      : fail(item, 'The page rejected the approved checkbox value.');
  }

  const requestedMatches = values.map((value) =>
    boxes.find((box) => optionMatches(box, value, doc))
  );
  if (!values.length || requestedMatches.some((match) => !match)) {
    return fail(item, 'Not every requested checkbox option has an editable match.');
  }

  const matched = [...new Set(requestedMatches.filter(Boolean) as HTMLInputElement[])];
  matched.forEach((box) => {
    setNativeChecked(box, true);
    dispatchFieldEvents(box);
  });
  return matched.every((box) => box.checked)
    ? ok(item, 'Updated approved checkbox options.')
    : fail(item, 'The page rejected one or more approved checkbox options.');
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
  const element = safeQuerySelector(doc, item.candidate.selector);
  return element instanceof HTMLInputElement ? [element] : [];
}

function findMatchingOption(
  options: HTMLOptionElement[],
  value: string
): HTMLOptionElement | undefined {
  const requested = normalizeOption(value);
  return options.find((option) => {
    const optionValue = normalizeOption(option.value);
    const optionLabel = normalizeOption(option.textContent ?? '');
    if (option.disabled) return false;
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
    inputValue === requested ||
    label === requested ||
    yesNoAliases(requested).includes(inputValue) ||
    yesNoAliases(requested).includes(label)
  );
}

function findInputLabel(input: HTMLInputElement, doc: Document): string | undefined {
  const explicit = input.id ? doc.querySelector(`label[for="${escapeCss(input.id)}"]`) : undefined;
  const wrapping = input.closest('label');
  return normalizeWhitespace(explicit?.textContent ?? wrapping?.textContent ?? '') || undefined;
}

function safeQuerySelector(
  doc: Document,
  selector: string
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined {
  try {
    return (
      doc.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector) ??
      undefined
    );
  } catch {
    return undefined;
  }
}

function matchesCandidateIdentity(
  item: FillPreviewItem,
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): boolean {
  if (item.candidate.tagName && element.tagName.toLowerCase() !== item.candidate.tagName) {
    return false;
  }
  if (
    item.candidate.inputType &&
    element instanceof HTMLInputElement &&
    element.type !== item.candidate.inputType
  ) {
    return false;
  }
  if (item.candidate.id && element.id !== item.candidate.id) return false;
  if (item.candidate.name && element.getAttribute('name') !== item.candidate.name) return false;
  return true;
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

function setNativeSelectValue(element: HTMLSelectElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(element, value);
  if (!descriptor?.set) element.value = value;
}

function setNativeChecked(element: HTMLInputElement, checked: boolean): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
  descriptor?.set?.call(element, checked);
  if (!descriptor?.set) element.checked = checked;
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

function isElementVisibleNow(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      current.hasAttribute('hidden') ||
      current.getAttribute('aria-hidden') === 'true' ||
      style?.display === 'none' ||
      style?.visibility === 'hidden'
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function isEditableChoice(element: HTMLInputElement): boolean {
  return !element.disabled && !element.readOnly && isElementVisibleNow(element);
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
