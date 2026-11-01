import type { FormFieldCandidate } from '../shared/models/FormFieldCandidate';
import { maxFillItems } from '../shared/extension/PageCommandIntegrity';
import { normalizeWhitespace } from '../shared/utils/Validation';

const nativeFieldSelector = 'input, textarea, select';
const ignoredInputTypes = ['hidden', 'submit', 'button', 'reset', 'image'];
const maxDetectedCandidates = maxFillItems + 1;
const maxFieldOptions = 100;
const maxScannedElements = 10_000;
const maxFieldTextLength = 180;
const maxTextNodesPerField = 100;
const maxAncestorDepth = 100;
const ignoredFieldTextSelector = 'input, textarea, select, option, script, style';
const domIdentities = new WeakMap<Element, number>();
let nextDomIdentity = 1;

export type DetectedFormFields = FormFieldCandidate[] & { truncated: boolean };

type ClassificationTextStatus = { complete: boolean };

export function detectFormFields(doc: Document = document): DetectedFormFields {
  const candidates = Object.assign([] as FormFieldCandidate[], { truncated: false });
  const nativeScan = scanElements(doc, nativeFieldSelector, maxDetectedCandidates);
  const groupedNames = new Set<string>();
  const formScopeIds = new WeakMap<HTMLFormElement, number>();
  let nextFormScopeId = 0;

  for (const element of nativeScan.elements) {
    if (candidates.length >= maxDetectedCandidates) {
      candidates.truncated = true;
      break;
    }
    if (isIgnoredInput(element)) continue;
    if (element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)) {
      const groupKey = `${element.type}:${getFormScopeKey(element, formScopeIds, () => nextFormScopeId++)}:${element.name || buildSelector(element, doc).selector}`;
      if (groupedNames.has(groupKey)) continue;
      groupedNames.add(groupKey);
      candidates.push(toGroupedCandidate(element, doc));
      continue;
    }
    candidates.push(toNativeCandidate(element, doc));
  }
  candidates.truncated ||= nativeScan.truncated || candidates.length >= maxDetectedCandidates;

  const widgetResult = nativeScan.truncated
    ? { fields: [], truncated: false }
    : detectAriaWidgets(doc, maxDetectedCandidates - candidates.length);
  candidates.push(...widgetResult.fields);
  candidates.truncated ||= widgetResult.truncated || candidates.length >= maxDetectedCandidates;
  return candidates;
}

export function detectApplicationIframeWarnings(doc: Document = document): string[] {
  let foundLikelyFrame = false;
  const frameScan = scanElements(doc, 'iframe', maxDetectedCandidates);
  for (const frame of frameScan.elements) {
    const text = normalizeWhitespace(
      [frame.title, (frame as HTMLIFrameElement).name, frame.id, frame.getAttribute('src')]
        .filter(Boolean)
        .join(' ')
    ).toLowerCase();
    if (/apply|application|candidate|career|job|form|talent/.test(text)) {
      foundLikelyFrame = true;
      break;
    }
  }
  foundLikelyFrame ||= frameScan.truncated;
  return foundLikelyFrame
    ? [
        'This application may be inside an iframe. If fields are missing, open the frame page directly or fill it manually.'
      ]
    : [];
}

export function detectCurrentFormFieldCandidate(
  doc: Document,
  selector: string,
  choiceGroup: boolean,
  expectedMatchCount: number
): FormFieldCandidate | undefined {
  if (expectedMatchCount <= 0 || expectedMatchCount > maxFieldOptions) return undefined;
  const matches = scanElements(doc, selector, expectedMatchCount);
  if (matches.truncated || matches.elements.length !== expectedMatchCount) return undefined;

  const element = matches.elements[0];
  if (choiceGroup) {
    if (
      !(element instanceof HTMLInputElement) ||
      !['radio', 'checkbox'].includes(element.type) ||
      isIgnoredInput(element)
    ) {
      return undefined;
    }
    return toGroupedCandidate(element, doc);
  }

  if (!element.matches(nativeFieldSelector) || isIgnoredInput(element)) return undefined;
  return toNativeCandidate(element, doc);
}

function toNativeCandidate(element: HTMLElement, doc: Document): FormFieldCandidate {
  const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const selectorInfo = buildSelector(input, doc);
  const inputType = input instanceof HTMLInputElement ? input.type : undefined;
  const textStatus: ClassificationTextStatus = { complete: true };
  const fieldsetLegend = findFieldsetLegend(input, textStatus);
  const optionSnapshot = collectNativeOptions(input, textStatus);

  return {
    selector: selectorInfo.selector,
    stableSelector: selectorInfo.stable,
    formContext: getFormContext(input),
    domIdentity: getDomIdentity(input),
    inputType,
    tagName: input.tagName.toLowerCase(),
    labelText: findLabelText(input, doc, textStatus),
    ariaLabel: input.getAttribute('aria-label') || undefined,
    ariaDescribedBy: getReferencedText(input, 'aria-describedby', doc, textStatus),
    ariaLabelledBy: getReferencedText(input, 'aria-labelledby', doc, textStatus),
    placeholder: input.getAttribute('placeholder') || undefined,
    name: input.getAttribute('name') || undefined,
    id: input.id || undefined,
    autocomplete: input.getAttribute('autocomplete') || undefined,
    dataTestId: getDataTestId(input),
    nearbyText: findNearbyText(input, textStatus),
    sectionHeading: findSectionHeading(input, textStatus),
    groupLabel: fieldsetLegend,
    fieldsetLegend,
    options: optionSnapshot.labels,
    optionValues: optionSnapshot.values,
    optionCount: optionSnapshot.count,
    optionListComplete: optionSnapshot.complete,
    required: isRequired(input, textStatus),
    visible: isVisible(input),
    disabled: isDisabled(input),
    readOnly:
      input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
        ? input.readOnly
        : false,
    role: input.getAttribute('role') || undefined,
    classificationContextComplete: textStatus.complete,
    controlFamily:
      inputType === 'file'
        ? 'file-upload'
        : input instanceof HTMLTextAreaElement
          ? 'native-textarea'
          : input instanceof HTMLSelectElement
            ? input.multiple
              ? 'native-multi-select'
              : 'native-select'
            : 'native-input',
    candidateSource: 'native-control'
  };
}

function toGroupedCandidate(input: HTMLInputElement, doc: Document): FormFieldCandidate {
  const groupSelector = input.name ? buildGroupedSelector(input, doc) : buildSelector(input, doc);
  const scope: ParentNode = input.form ?? doc;
  let group: HTMLInputElement[] = [input];
  let groupMemberCount = 1;
  if (input.name) {
    const groupScan = scanElements(
      scope,
      `input[type="${input.type}"][name="${escapeCss(input.name)}"]`,
      maxFieldOptions
    );
    group = groupScan.elements
      .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
      .slice(0, maxFieldOptions);
    groupMemberCount = groupScan.truncated ? maxFieldOptions + 1 : group.length;
  }
  const selectorInfo = groupSelector;
  const textStatus: ClassificationTextStatus = { complete: true };
  if (groupMemberCount > maxFieldOptions) textStatus.complete = false;
  const fieldsetLegend = findFieldsetLegend(input, textStatus);
  const groupLabel =
    fieldsetLegend ??
    findGroupLabel(input, doc, textStatus) ??
    findLabelText(input, doc, textStatus);
  const optionLabels = group.map((item) => {
    const label = findLabelText(item, doc, textStatus);
    if (!label && item.value.length > maxFieldTextLength) textStatus.complete = false;
    return label ?? item.value;
  });
  const optionValues = group.map((item) => {
    if (item.value.length > maxFieldTextLength) textStatus.complete = false;
    return item.value;
  });

  return {
    selector: selectorInfo.selector,
    stableSelector: selectorInfo.stable,
    formContext: getFormContext(input),
    domIdentity: getDomIdentity(input),
    inputType: input.type,
    tagName: input.tagName.toLowerCase(),
    labelText: groupLabel,
    ariaLabel: input.getAttribute('aria-label') || undefined,
    ariaDescribedBy: getReferencedText(input, 'aria-describedby', doc, textStatus),
    ariaLabelledBy: getReferencedText(input, 'aria-labelledby', doc, textStatus),
    name: input.name || undefined,
    id: input.id || undefined,
    autocomplete: input.getAttribute('autocomplete') || undefined,
    dataTestId: getDataTestId(input),
    nearbyText: findNearbyText(input, textStatus),
    sectionHeading: findSectionHeading(input, textStatus),
    groupName: input.name || selectorInfo.selector,
    groupLabel,
    fieldsetLegend,
    options: optionLabels.map(normalizeWhitespace).filter(Boolean),
    optionValues: optionValues.map(normalizeWhitespace).filter(Boolean),
    groupMemberCount,
    groupMemberIdentities: group.map(getDomIdentity),
    required: group.some((item) => isRequired(item, textStatus)),
    visible: group.some(isVisible),
    disabled: group.every(isDisabled),
    readOnly: false,
    role: input.getAttribute('role') || undefined,
    controlFamily: input.type === 'radio' ? 'radio-group' : 'checkbox-group',
    candidateSource: 'grouped-control',
    classificationContextComplete: textStatus.complete
  };
}

function detectAriaWidgets(
  doc: Document,
  limit: number
): { fields: FormFieldCandidate[]; truncated: boolean } {
  if (limit <= 0) return { fields: [], truncated: false };
  const fields: FormFieldCandidate[] = [];
  const widgetScan = scanElements(
    doc,
    '[role="combobox"], [aria-haspopup="listbox"], [contenteditable="true"], [role="radio"], [role="checkbox"]',
    limit
  );

  for (const element of widgetScan.elements) {
    if (fields.length >= limit) return { fields, truncated: true };
    if (element.matches(nativeFieldSelector)) continue;
    const selectorInfo = buildSelector(element, doc);
    const role = element.getAttribute('role') || undefined;
    const customSelect = element.getAttribute('aria-haspopup') === 'listbox';
    const textStatus: ClassificationTextStatus = { complete: true };
    const options = collectAriaOptions(element, textStatus);
    fields.push({
      selector: selectorInfo.selector,
      stableSelector: selectorInfo.stable,
      tagName: element.tagName.toLowerCase(),
      labelText:
        findLabelText(element, doc, textStatus) ??
        getReferencedText(element, 'aria-labelledby', doc, textStatus),
      ariaLabel: element.getAttribute('aria-label') || undefined,
      ariaDescribedBy: getReferencedText(element, 'aria-describedby', doc, textStatus),
      ariaLabelledBy: getReferencedText(element, 'aria-labelledby', doc, textStatus),
      name: element.getAttribute('name') || undefined,
      id: element.id || undefined,
      dataTestId: getDataTestId(element),
      nearbyText: findNearbyText(element, textStatus),
      sectionHeading: findSectionHeading(element, textStatus),
      options,
      optionValues: options,
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
      candidateSource: 'aria-widget',
      classificationContextComplete: textStatus.complete
    });
  }
  return { fields, truncated: widgetScan.truncated };
}

function isIgnoredInput(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement && ignoredInputTypes.includes(element.type.toLowerCase())
  );
}

function collectNativeOptions(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  textStatus?: ClassificationTextStatus
): {
  labels: string[];
  values: string[];
  count?: number;
  complete?: boolean;
} {
  if (!(input instanceof HTMLSelectElement)) return { labels: [], values: [] };
  const labels: string[] = [];
  const values: string[] = [];
  const count = Math.min(input.options.length, maxFieldOptions);
  let complete = input.options.length <= maxFieldOptions;
  for (let index = 0; index < count; index += 1) {
    const option = input.options[index];
    if (!option) continue;
    const boundedLabel = boundedTextContentDetails(option, maxFieldTextLength);
    if (boundedLabel.truncated || option.value.length > maxFieldTextLength) complete = false;
    const label =
      boundedLabel.text || normalizeWhitespace(option.value.slice(0, maxFieldTextLength));
    if (label) labels.push(label);
    const value = normalizeWhitespace(option.value.slice(0, maxFieldTextLength));
    if (value) values.push(value);
  }
  if (!complete && textStatus) textStatus.complete = false;
  return {
    labels,
    values,
    count: Math.min(input.options.length, maxFieldOptions + 1),
    complete
  };
}

function collectAriaOptions(element: HTMLElement, textStatus: ClassificationTextStatus): string[] {
  const owner =
    element.closest('[role="combobox"], [aria-haspopup="listbox"]') ?? element.parentElement;
  const options: string[] = [];
  const optionScan = owner ? scanElements(owner, '[role="option"]', maxFieldOptions) : undefined;
  if (optionScan?.truncated) textStatus.complete = false;
  for (const option of optionScan?.elements ?? []) {
    const label = boundedTextContent(option, maxFieldTextLength, textStatus);
    const ariaLabel = option.getAttribute('aria-label') ?? '';
    if (ariaLabel.length > maxFieldTextLength) textStatus.complete = false;
    const value = label || normalizeWhitespace(ariaLabel.slice(0, maxFieldTextLength));
    if (value) options.push(value);
    if (options.length >= maxFieldOptions) break;
  }
  return options;
}

function findLabelText(
  input: HTMLElement,
  doc: Document,
  textStatus?: ClassificationTextStatus
): string | undefined {
  const id = input.id;
  const explicit = id ? doc.querySelector(`label[for="${escapeCss(id)}"]`) : undefined;
  const wrapping = input.closest('label');
  const labelledBy = getReferencedText(input, 'aria-labelledby', doc, textStatus);
  const containerLabel = input
    .closest('[data-label], .field, .form-field, .input-group')
    ?.querySelector('label, .label, [data-label-text]');
  return (
    boundedTextContent(explicit, maxFieldTextLength, textStatus) ||
    boundedTextContent(wrapping, maxFieldTextLength, textStatus) ||
    labelledBy ||
    boundedTextContent(containerLabel, maxFieldTextLength, textStatus) ||
    undefined
  );
}

function findGroupLabel(
  input: HTMLElement,
  doc: Document,
  textStatus: ClassificationTextStatus
): string | undefined {
  const group = input.closest('[role="group"], .radio-group, .checkbox-group, fieldset');
  return (
    getReferencedText(group, 'aria-labelledby', doc, textStatus) ||
    boundedTextContent(
      group?.querySelector('legend, h1, h2, h3, h4, .label'),
      maxFieldTextLength,
      textStatus
    ) ||
    undefined
  );
}

function getReferencedText(
  input: Element | null | undefined,
  attribute: string,
  doc: Document,
  textStatus?: ClassificationTextStatus
): string | undefined {
  if (!input) return undefined;

  const rawIds = input.getAttribute(attribute) ?? '';
  if (rawIds.length > maxFieldTextLength && textStatus) textStatus.complete = false;
  const allIds = rawIds.split(/\s+/).filter(Boolean);
  if (allIds.length > 10 && textStatus) textStatus.complete = false;
  const ids = allIds.slice(0, 10);
  const text = ids
    .map((id) => boundedTextContent(doc.getElementById(id), maxFieldTextLength, textStatus))
    .filter(Boolean)
    .join(' ');
  if (normalizeWhitespace(text).length > maxFieldTextLength && textStatus) {
    textStatus.complete = false;
  }
  return normalizeWhitespace(text).slice(0, maxFieldTextLength) || undefined;
}

function findNearbyText(
  input: HTMLElement,
  textStatus?: ClassificationTextStatus
): string | undefined {
  const parent = input.closest('label, div, fieldset, section, li, p') ?? input.parentElement;
  if (parent?.tagName.toLowerCase() === 'form') {
    const text = normalizeWhitespace(
      [
        boundedTextContent(input.previousElementSibling, maxFieldTextLength, textStatus),
        boundedTextContent(input.nextElementSibling, maxFieldTextLength, textStatus)
      ]
        .filter(Boolean)
        .join(' ')
    );
    if (text.length > maxFieldTextLength && textStatus) textStatus.complete = false;
    return text.slice(0, maxFieldTextLength) || undefined;
  }
  return boundedTextContent(parent, maxFieldTextLength, textStatus) || undefined;
}

function findSectionHeading(
  input: HTMLElement,
  textStatus: ClassificationTextStatus
): string | undefined {
  const container = input.closest('fieldset, section, form, div');
  const heading = container?.querySelector(
    ':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > legend'
  );
  return boundedTextContent(heading, maxFieldTextLength, textStatus) || undefined;
}

function findFieldsetLegend(
  input: HTMLElement,
  textStatus: ClassificationTextStatus
): string | undefined {
  return (
    boundedTextContent(
      input.closest('fieldset')?.querySelector('legend'),
      maxFieldTextLength,
      textStatus
    ) || undefined
  );
}

function boundedTextContent(
  element: Element | null | undefined,
  maxLength: number,
  textStatus?: ClassificationTextStatus
): string {
  const result = boundedTextContentDetails(element, maxLength);
  if (result.truncated && textStatus) textStatus.complete = false;
  return result.text;
}

function boundedTextContentDetails(
  element: Element | null | undefined,
  maxLength: number
): { text: string; truncated: boolean } {
  if (!element) return { text: '', truncated: false };

  let text = '';
  let visitedNodes = 0;
  let truncated = false;
  let node: Node | null = element;

  while (node && visitedNodes < maxTextNodesPerField && text.length < maxLength) {
    visitedNodes += 1;
    if (node.nodeType === 3) {
      const value = node.nodeValue ?? '';
      const remaining = maxLength - text.length;
      if (value.length > remaining) truncated = true;
      text += value.slice(0, remaining);
    }

    const skipChildren =
      node !== element &&
      node.nodeType === 1 &&
      (node as Element).matches(ignoredFieldTextSelector);
    node = nextNodeWithinRoot(node, element, skipChildren);
  }

  if (node) truncated = true;
  return { text: normalizeWhitespace(text).slice(0, maxLength), truncated };
}

function nextNodeWithinRoot(node: Node, root: Node, skipChildren: boolean): Node | null {
  if (!skipChildren && node.firstChild) return node.firstChild;
  let current: Node = node;
  while (current !== root && !current.nextSibling) {
    if (!current.parentNode) return null;
    current = current.parentNode;
  }
  return current === root ? null : current.nextSibling;
}

function isRequired(input: HTMLElement, textStatus?: ClassificationTextStatus): boolean {
  return (
    input.hasAttribute('required') ||
    input.getAttribute('aria-required') === 'true' ||
    /\*\s*$|required/i.test(findLabelText(input, input.ownerDocument, textStatus) ?? '') ||
    /\*\s*$|required/i.test(findNearbyText(input, textStatus) ?? '')
  );
}

function isDisabled(element: HTMLElement): boolean {
  return (
    element.matches(':disabled') ||
    element.getAttribute('aria-disabled') === 'true' ||
    Boolean(element.closest('[aria-disabled="true"], [inert]'))
  );
}

function isVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  let depth = 0;
  while (current && depth < maxAncestorDepth) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      current.hasAttribute('hidden') ||
      current.hasAttribute('inert') ||
      current.getAttribute('aria-hidden') === 'true' ||
      style?.display === 'none' ||
      Number.parseFloat(style?.opacity ?? '1') <= 0 ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    ) {
      return false;
    }
    current = current.parentElement;
    depth += 1;
  }
  return current === null;
}

function getFormContext(element: HTMLElement): string | undefined {
  const form =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? element.form
      : element.closest('form');
  if (!form) return undefined;

  const action = form.getAttribute('action');
  let actionPath: string | null = null;
  if (action !== null) {
    try {
      const url = new URL(action, form.ownerDocument.baseURI);
      actionPath = `${url.origin}${url.pathname}`.slice(0, maxFieldTextLength);
    } catch {
      actionPath = action.slice(0, maxFieldTextLength);
    }
  }

  return JSON.stringify([
    getDomIdentity(form),
    form.id.slice(0, maxFieldTextLength),
    form.getAttribute('name')?.slice(0, maxFieldTextLength) ?? null,
    form.getAttribute('aria-label')?.slice(0, maxFieldTextLength) ?? null,
    form.getAttribute('role')?.slice(0, maxFieldTextLength) ?? null,
    form.getAttribute('method')?.slice(0, maxFieldTextLength) ?? null,
    form.getAttribute('target')?.slice(0, maxFieldTextLength) ?? null,
    form.getAttribute('autocomplete')?.slice(0, maxFieldTextLength) ?? null,
    form.getAttribute('enctype')?.slice(0, maxFieldTextLength) ?? null,
    actionPath
  ]);
}

function getDomIdentity(element: Element): number {
  const existing = domIdentities.get(element);
  if (existing !== undefined) return existing;
  const identity = nextDomIdentity++;
  domIdentities.set(element, identity);
  return identity;
}

function scanElements(
  root: ParentNode,
  selector: string,
  limit: number
): { elements: HTMLElement[]; truncated: boolean } {
  const rootNode = root as Node;
  const ownerDocument = rootNode.nodeType === 9 ? (rootNode as Document) : rootNode.ownerDocument;
  const nodeFilter = ownerDocument?.defaultView?.NodeFilter;
  if (!ownerDocument || !nodeFilter || limit <= 0) return { elements: [], truncated: false };

  const walkerRoot =
    rootNode.nodeType === 9 ? ((rootNode as Document).documentElement ?? rootNode) : rootNode;
  const walker = ownerDocument.createTreeWalker(walkerRoot, nodeFilter.SHOW_ELEMENT);
  const elements: HTMLElement[] = [];
  let node = walker.nextNode();
  let scannedElements = 0;

  while (node && scannedElements < maxScannedElements) {
    scannedElements += 1;
    if ((node as Element).matches(selector)) {
      elements.push(node as HTMLElement);
      if (elements.length > limit) return { elements: elements.slice(0, limit), truncated: true };
    }
    node = walker.nextNode();
  }

  return { elements, truncated: node !== null };
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
    const matches = scanElements(doc, selector, 1);
    if (matches.elements.length === 1 && !matches.truncated) {
      return { selector, stable: true };
    }
  }

  return { selector: buildDomPath(element, doc), stable: false };
}

function buildGroupedSelector(
  input: HTMLInputElement,
  doc: Document
): { selector: string; stable: boolean } {
  const base = `input[type="${input.type}"][name="${escapeCss(input.name)}"]`;
  if (!input.form) {
    const matches = scanElements(doc, base, 1);
    return {
      selector: base,
      stable: matches.elements.length > 0
    };
  }

  const formSelector = buildSelector(input.form, doc);
  return {
    selector: `${formSelector.selector} ${base}`,
    stable: formSelector.stable
  };
}

function getFormScopeKey(
  input: HTMLInputElement,
  formScopeIds: WeakMap<HTMLFormElement, number>,
  nextId: () => number
): string {
  if (!input.form) return 'document';
  let index = formScopeIds.get(input.form);
  if (index === undefined) {
    index = nextId();
    formScopeIds.set(input.form, index);
  }
  return `form-${index}`;
}

function buildDomPath(element: HTMLElement, doc: Document): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== doc.documentElement) {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (candidate) => candidate.tagName === current?.tagName
        )
      : [];
    const position = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${Math.max(position, 1)})`);
    current = current.parentElement;
  }

  return parts.join(' > ');
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
