import type { FormFieldCandidate } from '../shared/models/FormFieldCandidate';
import { normalizeWhitespace } from '../shared/utils/Validation';

const nativeFieldSelector = 'input, textarea, select';
const ignoredInputTypes = ['hidden', 'submit', 'button', 'reset', 'image'];

export function detectFormFields(doc: Document = document): FormFieldCandidate[] {
  const nativeFields = Array.from(doc.querySelectorAll<HTMLElement>(nativeFieldSelector));
  const groupedNames = new Set<string>();
  const candidates: FormFieldCandidate[] = [];

  for (const element of nativeFields) {
    if (isIgnoredInput(element)) continue;
    if (element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)) {
      const groupKey = `${element.type}:${element.name || buildSelector(element, doc).selector}`;
      if (groupedNames.has(groupKey)) continue;
      groupedNames.add(groupKey);
      candidates.push(toGroupedCandidate(element, doc));
      continue;
    }
    candidates.push(toNativeCandidate(element, doc));
  }

  candidates.push(...detectAriaWidgets(doc));
  return candidates;
}

export function detectApplicationIframeWarnings(doc: Document = document): string[] {
  const frames = Array.from(doc.querySelectorAll('iframe'));
  const likelyFrames = frames.filter((frame) => {
    const text = normalizeWhitespace(
      [frame.title, frame.name, frame.id, frame.getAttribute('src')].filter(Boolean).join(' ')
    ).toLowerCase();
    return /apply|application|candidate|career|job|form|talent/.test(text);
  });
  return likelyFrames.length
    ? [
        'This application may be inside an iframe. If fields are missing, open the frame page directly or fill it manually.'
      ]
    : [];
}

function toNativeCandidate(element: HTMLElement, doc: Document): FormFieldCandidate {
  const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const selectorInfo = buildSelector(input, doc);
  const inputType = input instanceof HTMLInputElement ? input.type : undefined;
  const fieldsetLegend = findFieldsetLegend(input);

  return {
    selector: selectorInfo.selector,
    stableSelector: selectorInfo.stable,
    inputType,
    tagName: input.tagName.toLowerCase(),
    labelText: findLabelText(input, doc),
    ariaLabel: input.getAttribute('aria-label') || undefined,
    ariaDescribedBy: getReferencedText(input, 'aria-describedby', doc),
    ariaLabelledBy: getReferencedText(input, 'aria-labelledby', doc),
    placeholder: input.getAttribute('placeholder') || undefined,
    name: input.getAttribute('name') || undefined,
    id: input.id || undefined,
    autocomplete: input.getAttribute('autocomplete') || undefined,
    dataTestId: getDataTestId(input),
    nearbyText: findNearbyText(input),
    sectionHeading: findSectionHeading(input),
    groupLabel: fieldsetLegend,
    fieldsetLegend,
    options: collectNativeOptionLabels(input),
    optionValues: collectNativeOptionValues(input),
    required: isRequired(input),
    visible: isVisible(input),
    disabled: isDisabled(input),
    readOnly:
      input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
        ? input.readOnly
        : false,
    role: input.getAttribute('role') || undefined,
    controlFamily:
      inputType === 'file'
        ? 'file-upload'
        : input instanceof HTMLTextAreaElement
          ? 'native-textarea'
          : input instanceof HTMLSelectElement
            ? 'native-select'
            : 'native-input',
    candidateSource: 'native-control'
  };
}

function toGroupedCandidate(input: HTMLInputElement, doc: Document): FormFieldCandidate {
  const group = input.name
    ? Array.from(
        doc.querySelectorAll<HTMLInputElement>(
          `input[type="${input.type}"][name="${escapeCss(input.name)}"]`
        )
      )
    : [input];
  const selectorInfo = input.name
    ? {
        selector: `input[type="${input.type}"][name="${escapeCss(input.name)}"]`,
        stable: true
      }
    : buildSelector(input, doc);
  const fieldsetLegend = findFieldsetLegend(input);
  const groupLabel = fieldsetLegend ?? findGroupLabel(input, doc) ?? findLabelText(input, doc);

  return {
    selector: selectorInfo.selector,
    stableSelector: selectorInfo.stable,
    inputType: input.type,
    tagName: input.tagName.toLowerCase(),
    labelText: groupLabel,
    ariaLabel: input.getAttribute('aria-label') || undefined,
    ariaDescribedBy: getReferencedText(input, 'aria-describedby', doc),
    ariaLabelledBy: getReferencedText(input, 'aria-labelledby', doc),
    name: input.name || undefined,
    id: input.id || undefined,
    autocomplete: input.getAttribute('autocomplete') || undefined,
    dataTestId: getDataTestId(input),
    nearbyText: findNearbyText(input),
    sectionHeading: findSectionHeading(input),
    groupName: input.name || selectorInfo.selector,
    groupLabel,
    fieldsetLegend,
    options: group
      .map((item) => findLabelText(item, doc) ?? item.value)
      .map(normalizeWhitespace)
      .filter(Boolean),
    optionValues: group
      .map((item) => item.value)
      .map(normalizeWhitespace)
      .filter(Boolean),
    required: group.some(isRequired),
    visible: group.some(isVisible),
    disabled: group.every(isDisabled),
    readOnly: false,
    role: input.getAttribute('role') || undefined,
    controlFamily: input.type === 'radio' ? 'radio-group' : 'checkbox-group',
    candidateSource: 'grouped-control'
  };
}

function detectAriaWidgets(doc: Document): FormFieldCandidate[] {
  const widgets = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '[role="combobox"], [aria-haspopup="listbox"], [contenteditable="true"], [role="radio"], [role="checkbox"]'
    )
  ).filter((element) => !element.matches(nativeFieldSelector));

  return widgets.map((element) => {
    const selectorInfo = buildSelector(element, doc);
    const role = element.getAttribute('role') || undefined;
    const customSelect = element.getAttribute('aria-haspopup') === 'listbox';
    return {
      selector: selectorInfo.selector,
      stableSelector: selectorInfo.stable,
      tagName: element.tagName.toLowerCase(),
      labelText: findLabelText(element, doc) ?? getReferencedText(element, 'aria-labelledby', doc),
      ariaLabel: element.getAttribute('aria-label') || undefined,
      ariaDescribedBy: getReferencedText(element, 'aria-describedby', doc),
      ariaLabelledBy: getReferencedText(element, 'aria-labelledby', doc),
      name: element.getAttribute('name') || undefined,
      id: element.id || undefined,
      dataTestId: getDataTestId(element),
      nearbyText: findNearbyText(element),
      sectionHeading: findSectionHeading(element),
      options: collectAriaOptions(element),
      optionValues: collectAriaOptions(element),
      required: element.getAttribute('aria-required') === 'true',
      visible: isVisible(element),
      disabled: element.getAttribute('aria-disabled') === 'true',
      readOnly: false,
      role,
      controlFamily:
        role === 'combobox'
          ? 'aria-combobox'
          : customSelect
            ? 'custom-select'
            : role === 'radio'
              ? 'radio-group'
              : role === 'checkbox'
                ? 'checkbox-group'
                : 'unknown-widget',
      candidateSource: 'aria-widget'
    };
  });
}

function isIgnoredInput(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement && ignoredInputTypes.includes(element.type.toLowerCase())
  );
}

function collectNativeOptionLabels(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): string[] {
  if (!(input instanceof HTMLSelectElement)) return [];
  return Array.from(input.options)
    .map((option) => normalizeWhitespace(option.textContent ?? option.value))
    .filter(Boolean);
}

function collectNativeOptionValues(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): string[] {
  if (!(input instanceof HTMLSelectElement)) return [];
  return Array.from(input.options)
    .map((option) => normalizeWhitespace(option.value))
    .filter(Boolean);
}

function collectAriaOptions(element: HTMLElement): string[] {
  const owner =
    element.closest('[role="combobox"], [aria-haspopup="listbox"]') ?? element.parentElement;
  return Array.from(owner?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    .map((option) =>
      normalizeWhitespace(option.textContent ?? option.getAttribute('aria-label') ?? '')
    )
    .filter(Boolean);
}

function findLabelText(input: HTMLElement, doc: Document): string | undefined {
  const id = input.id;
  const explicit = id ? doc.querySelector(`label[for="${escapeCss(id)}"]`) : undefined;
  const wrapping = input.closest('label');
  const labelledBy = getReferencedText(input, 'aria-labelledby', doc);
  const containerLabel = input
    .closest('[data-label], .field, .form-field, .input-group')
    ?.querySelector('label, .label, [data-label-text]');
  return (
    normalizeWhitespace(
      explicit?.textContent ??
        wrapping?.textContent ??
        labelledBy ??
        containerLabel?.textContent ??
        ''
    ) || undefined
  );
}

function findGroupLabel(input: HTMLElement, doc: Document): string | undefined {
  const group = input.closest('[role="group"], .radio-group, .checkbox-group, fieldset');
  const labelledBy = group?.getAttribute('aria-labelledby');
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent)
      .filter(Boolean)
      .map((value) => normalizeWhitespace(value ?? ''))
      .join(' ');
  }
  return (
    normalizeWhitespace(
      group?.querySelector('legend, h1, h2, h3, h4, .label')?.textContent ?? ''
    ) || undefined
  );
}

function getReferencedText(
  input: HTMLElement,
  attribute: string,
  doc: Document
): string | undefined {
  const ids = input.getAttribute(attribute)?.split(/\s+/).filter(Boolean) ?? [];
  const text = ids
    .map((id) => doc.getElementById(id)?.textContent)
    .filter(Boolean)
    .map((value) => normalizeWhitespace(value ?? ''))
    .join(' ');
  return text || undefined;
}

function findNearbyText(input: HTMLElement): string | undefined {
  const parent = input.closest('label, div, fieldset, section, li, p') ?? input.parentElement;
  if (parent?.tagName.toLowerCase() === 'form') {
    return (
      normalizeWhitespace(
        [input.previousElementSibling?.textContent, input.nextElementSibling?.textContent]
          .filter(Boolean)
          .join(' ')
      ).slice(0, 180) || undefined
    );
  }
  const clone = parent?.cloneNode(true) as HTMLElement | undefined;
  clone
    ?.querySelectorAll('input, textarea, select, option, script, style')
    .forEach((item) => item.remove());
  return normalizeWhitespace(clone?.textContent ?? '').slice(0, 180) || undefined;
}

function findSectionHeading(input: HTMLElement): string | undefined {
  const container = input.closest('fieldset, section, form, div');
  const heading = container?.querySelector(
    ':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > legend'
  );
  return normalizeWhitespace(heading?.textContent ?? '') || undefined;
}

function findFieldsetLegend(input: HTMLElement): string | undefined {
  return (
    normalizeWhitespace(input.closest('fieldset')?.querySelector('legend')?.textContent ?? '') ||
    undefined
  );
}

function isRequired(input: HTMLElement): boolean {
  return (
    input.hasAttribute('required') ||
    input.getAttribute('aria-required') === 'true' ||
    /\*\s*$|required/i.test(findLabelText(input, input.ownerDocument) ?? '') ||
    /\*\s*$|required/i.test(findNearbyText(input) ?? '')
  );
}

function isDisabled(element: HTMLElement): boolean {
  return (
    ((element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) &&
      element.disabled) ||
    element.getAttribute('aria-disabled') === 'true'
  );
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    !element.hasAttribute('hidden') &&
    element.getAttribute('aria-hidden') !== 'true'
  );
}

function buildSelector(element: HTMLElement, doc: Document): { selector: string; stable: boolean } {
  const candidates = [
    element.id ? `#${escapeCss(element.id)}` : undefined,
    attrSelector(element, 'data-testid'),
    attrSelector(element, 'data-test'),
    attrSelector(element, 'data-qa'),
    element.getAttribute('name')
      ? `${element.tagName.toLowerCase()}[name="${escapeCss(element.getAttribute('name') ?? '')}"]`
      : undefined,
    element.getAttribute('autocomplete')
      ? `${element.tagName.toLowerCase()}[autocomplete="${escapeCss(element.getAttribute('autocomplete') ?? '')}"]`
      : undefined,
    element.getAttribute('aria-label')
      ? `${element.tagName.toLowerCase()}[aria-label="${escapeCss(element.getAttribute('aria-label') ?? '')}"]`
      : undefined
  ].filter(Boolean) as string[];

  for (const selector of candidates) {
    if (doc.querySelectorAll(selector).length === 1) return { selector, stable: true };
  }

  const index = Array.from(doc.querySelectorAll(element.tagName)).indexOf(element) + 1;
  return { selector: `${element.tagName.toLowerCase()}:nth-of-type(${index})`, stable: false };
}

function attrSelector(element: HTMLElement, attr: string): string | undefined {
  const value = element.getAttribute(attr);
  return value ? `${element.tagName.toLowerCase()}[${attr}="${escapeCss(value)}"]` : undefined;
}

function getDataTestId(element: HTMLElement): string | undefined {
  return (
    element.getAttribute('data-testid') ||
    element.getAttribute('data-test') ||
    element.getAttribute('data-qa') ||
    undefined
  );
}

function escapeCss(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\#.;:[\],>+~*'=]/g, '\\$&');
}
