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

  if (isInput(element) && element.type === 'file') {
    return fail(item, 'File uploads require manual selection.');
  }

  if (isSelect(element)) return fillSelect(item, element);
  if (isInput(element) && element.type === 'radio') {
    return fillRadioGroup(item, doc);
  }
  if (isInput(element) && element.type === 'checkbox') {
    return fillCheckbox(item, doc);
  }
  if (!isInput(element) && !isTextArea(element)) {
    return fail(item, 'Unsupported field type.');
  }

  setNativeProperty(element, 'value', item.value);
  dispatchFieldEvents(element);
  return element.value === item.value
    ? ok(item, 'Filled approved field.')
    : fail(item, 'The page rejected the approved value. Review this field manually.');
}

function fillSelect(item: FillPreviewItem, element: HTMLSelectElement): FillResult {
  if (element.multiple) {
    return fail(item, 'Multiple-choice select fields require manual review.');
  }
  const option = findMatchingOption(Array.from(element.options), item.value ?? '');
  if (!option) return fail(item, 'No editable matching select option. Review this field manually.');
  setNativeProperty(element, 'value', option.value);
  dispatchFieldEvents(element);
  return element.value === option.value
    ? ok(item, 'Selected approved option.')
    : fail(item, 'The page rejected the approved option. Review this field manually.');
}

function fillRadioGroup(item: FillPreviewItem, doc: Document): FillResult {
  const radios = getGroupedInputs(item, doc, 'radio').filter(isEditableChoice);
  const match = radios.find((radio) => optionMatches(radio, item.value ?? '', doc));
  if (!match) return fail(item, 'No editable matching radio option. Review this field manually.');
  setNativeProperty(match, 'checked', true);
  dispatchFieldEvents(match);
  return match.checked
    ? ok(item, 'Selected approved radio option.')
    : fail(item, 'The page rejected the approved radio option.');
}

function fillCheckbox(item: FillPreviewItem, doc: Document): FillResult {
  const boxes = getGroupedInputs(item, doc, 'checkbox').filter(isEditableChoice);
  const values = splitRequestedValues(item.value ?? '');
  if (!boxes.length) return fail(item, 'No editable checkbox options were found.');

  if (boxes.length === 1 && isYesNo(values)) {
    const checked = ['yes', 'true', '1'].includes(values[0]);
    setNativeProperty(boxes[0], 'checked', checked);
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

  const matched = new Set(requestedMatches.filter(Boolean) as HTMLInputElement[]);
  for (const box of boxes) {
    const checked = matched.has(box);
    if (box.checked !== checked) {
      setNativeProperty(box, 'checked', checked);
      dispatchFieldEvents(box);
    }
  }

  const exact = boxes.every((box) => box.checked === matched.has(box));
  return exact
    ? ok(item, 'Updated approved checkbox options.')
    : fail(item, 'The page rejected one or more approved checkbox options.');
}

function getGroupedInputs(
  item: FillPreviewItem,
  doc: Document,
  type: 'radio' | 'checkbox'
): HTMLInputElement[] {
  const selected = safeQuerySelectorAll(doc, item.candidate.selector).filter(
    (element): element is HTMLInputElement => isInput(element) && element.type === type
  );
  return selected;
}

function findMatchingOption(
  options: HTMLOptionElement[],
  value: string
): HTMLOptionElement | undefined {
  const requested = normalizeOption(value);
  return options.find((option) => {
    if (isOptionDisabled(option)) return false;
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
    const element = doc.querySelector<HTMLElement>(selector);
    return isInput(element) || isTextArea(element) || isSelect(element) ? element : undefined;
  } catch {
    return undefined;
  }
}

function safeQuerySelectorAll(doc: Document, selector: string): HTMLElement[] {
  try {
    return Array.from(doc.querySelectorAll<HTMLElement>(selector));
  } catch {
    return [];
  }
}

function matchesCandidateIdentity(
  item: FillPreviewItem,
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): boolean {
  const candidate = item.candidate;
  if (candidate.tagName && element.tagName.toLowerCase() !== candidate.tagName) return false;
  if (candidate.inputType && isInput(element) && element.type !== candidate.inputType) return false;
  if (candidate.id && element.id !== candidate.id) return false;
  if (candidate.name && element.getAttribute('name') !== candidate.name) return false;
  if (candidate.autocomplete && element.getAttribute('autocomplete') !== candidate.autocomplete) {
    return false;
  }
  if (candidate.ariaLabel && element.getAttribute('aria-label') !== candidate.ariaLabel) {
    return false;
  }
  if (candidate.dataTestId && getDataTestId(element) !== candidate.dataTestId) {
    return false;
  }
  return true;
}

function setNativeProperty(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  property: 'value' | 'checked',
  value: string | boolean
): void {
  let prototype: object | null = Object.getPrototypeOf(element);
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (descriptor?.set) {
      descriptor.set.call(element, value);
      return;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  Reflect.set(element, property, value);
}

function dispatchFieldEvents(element: HTMLElement): void {
  const EventConstructor = element.ownerDocument.defaultView?.Event ?? Event;
  element.dispatchEvent(new EventConstructor('input', { bubbles: true }));
  element.dispatchEvent(new EventConstructor('change', { bubbles: true }));
  element.dispatchEvent(new EventConstructor('blur', { bubbles: true }));
}

function isElementDisabledOrReadOnly(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): boolean {
  return (
    element.matches(':disabled') ||
    element.getAttribute('aria-disabled') === 'true' ||
    Boolean(element.closest('[aria-disabled="true"], [inert]')) ||
    ((isInput(element) || isTextArea(element)) && element.readOnly)
  );
}

function isElementVisibleNow(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      current.hasAttribute('hidden') ||
      current.hasAttribute('inert') ||
      current.getAttribute('aria-hidden') === 'true' ||
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function isEditableChoice(element: HTMLInputElement): boolean {
  return !isElementDisabledOrReadOnly(element) && isElementVisibleNow(element);
}

function isOptionDisabled(option: HTMLOptionElement): boolean {
  return (
    option.disabled ||
    option.matches(':disabled') ||
    (option.parentElement?.tagName.toLowerCase() === 'optgroup' &&
      option.parentElement.hasAttribute('disabled'))
  );
}

function isInput(element: Element | null): element is HTMLInputElement {
  return element?.tagName.toLowerCase() === 'input';
}

function isTextArea(element: Element | null): element is HTMLTextAreaElement {
  return element?.tagName.toLowerCase() === 'textarea';
}

function isSelect(element: Element | null): element is HTMLSelectElement {
  return element?.tagName.toLowerCase() === 'select';
}

function getDataTestId(element: Element): string | undefined {
  return (
    element.getAttribute('data-testid') ||
    element.getAttribute('data-test') ||
    element.getAttribute('data-qa') ||
    undefined
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
