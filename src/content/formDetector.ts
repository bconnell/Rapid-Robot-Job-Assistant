import type { FormFieldCandidate } from '../shared/models/FormFieldCandidate';
import { normalizeWhitespace } from '../shared/utils/Validation';

const fieldSelector = 'input, textarea, select';

export function detectFormFields(doc: Document = document): FormFieldCandidate[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(fieldSelector))
    .filter((element) => !isIgnoredInput(element))
    .map((element) => toCandidate(element, doc));
}

function toCandidate(element: HTMLElement, doc: Document): FormFieldCandidate {
  const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const id = input.id || undefined;
  const name = input.getAttribute('name') || undefined;
  const labelText = findLabelText(input, doc);
  const options = collectOptions(input, doc);

  return {
    selector: buildSelector(input),
    inputType: input instanceof HTMLInputElement ? input.type : undefined,
    tagName: input.tagName.toLowerCase(),
    labelText,
    ariaLabel: input.getAttribute('aria-label') || undefined,
    placeholder: input.getAttribute('placeholder') || undefined,
    name,
    id,
    autocomplete: input.getAttribute('autocomplete') || undefined,
    nearbyText: findNearbyText(input),
    sectionHeading: findSectionHeading(input),
    options,
    required: input.hasAttribute('required') || input.getAttribute('aria-required') === 'true',
    visible: isVisible(input)
  };
}

function isIgnoredInput(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement &&
    ['hidden', 'submit', 'button', 'reset', 'image'].includes(element.type)
  );
}

function collectOptions(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  doc: Document
): string[] {
  if (input instanceof HTMLSelectElement) {
    return Array.from(input.options)
      .map((option) => normalizeWhitespace(option.textContent ?? option.value))
      .filter(Boolean);
  }
  if (input instanceof HTMLInputElement && ['radio', 'checkbox'].includes(input.type)) {
    const name = input.name;
    const group = name
      ? Array.from(
          doc.querySelectorAll<HTMLInputElement>(
            `input[type="${input.type}"][name="${escapeCss(name)}"]`
          )
        )
      : [input];
    return group
      .map((item) => findLabelText(item, doc) ?? item.value)
      .map(normalizeWhitespace)
      .filter(Boolean);
  }
  return [];
}

function findLabelText(input: HTMLElement, doc: Document): string | undefined {
  const id = input.id;
  const explicit = id ? doc.querySelector(`label[for="${escapeCss(id)}"]`) : undefined;
  const wrapping = input.closest('label');
  return normalizeWhitespace(explicit?.textContent ?? wrapping?.textContent ?? '') || undefined;
}

function findNearbyText(input: HTMLElement): string | undefined {
  const parent = input.closest('div, fieldset, section, li, p') ?? input.parentElement;
  return (
    normalizeWhitespace(parent?.textContent?.replace(input.textContent ?? '', '') ?? '').slice(
      0,
      300
    ) || undefined
  );
}

function findSectionHeading(input: HTMLElement): string | undefined {
  const container = input.closest('section, fieldset, form, div');
  const heading = container?.querySelector('h1,h2,h3,h4,legend');
  return normalizeWhitespace(heading?.textContent ?? '') || undefined;
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' && style.visibility !== 'hidden' && !element.hasAttribute('hidden')
  );
}

function buildSelector(element: HTMLElement): string {
  if (element.id) return `#${escapeCss(element.id)}`;
  const name = element.getAttribute('name');
  if (name) return `${element.tagName.toLowerCase()}[name="${escapeCss(name)}"]`;
  const index = Array.from(document.querySelectorAll(element.tagName)).indexOf(element) + 1;
  return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
}

function escapeCss(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\#.;:[\],>+~*'=]/g, '\\$&');
}
