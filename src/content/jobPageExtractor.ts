import type { JobPosting } from '../shared/models/JobPosting';
import { normalizeWhitespace, uniqueStrings } from '../shared/utils/Validation';

const keywordTerms = [
  'typescript',
  'javascript',
  'react',
  'node',
  'python',
  'sql',
  'aws',
  'azure',
  'docker',
  'kubernetes',
  'api',
  'accessibility',
  'security',
  'testing',
  'automation',
  'remote',
  'hybrid'
];

const descriptionSelectors = [
  '[data-testid*="job-description" i]',
  '[class*="job-description" i]',
  '[id*="job-description" i]',
  '[data-testid*="description" i]',
  'article',
  'main'
];

const removableContentSelector = [
  'form',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'script',
  'style',
  'noscript',
  'nav',
  'footer',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '#rapid-robot-job-assistant-root'
].join(',');
const maxDescriptionCandidates = 20;
const maxDescriptionTextLength = 12_000;
const maxDescriptionTextNodes = 20_000;
const maxMetadataCandidates = 100;
const maxMetadataTextLength = 180;
const maxMetadataTextNodes = 1_000;
const maxScannedElements = 10_000;

interface TextTraversalBudget {
  remainingNodes: number;
  remainingCharacters: number;
}

export function extractJobPostingFromDocument(doc: Document = document): JobPosting {
  const title = firstText(doc, [
    '[data-testid*="job-title" i]',
    '[class*="job-title" i]',
    '[itemprop="title"]',
    'h1',
    'title'
  ]);
  const company = firstText(doc, [
    '[data-testid*="company" i]',
    '[class*="company-name" i]',
    '[class~="company" i]',
    '[itemprop="hiringOrganization"]',
    '[aria-label*="company" i]'
  ]);
  const location = firstText(doc, [
    '[data-testid*="location" i]',
    '[class*="job-location" i]',
    '[itemprop="jobLocation"]',
    '[aria-label*="location" i]'
  ]);
  const bodyText = extractJobDescriptionText(doc);
  const salaryText = bodyText.match(
    /\$\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:-|–|to)\s*\$?\d[\d,]*(?:\.\d{1,2})?)?(?:\s*(?:\/|per)\s*(?:year|hour|yr|hr))?/i
  )?.[0];
  const remoteStatus = detectRemoteStatus(bodyText);
  const requirementsText = extractSection(bodyText, [
    'requirements',
    'qualifications',
    'what you bring'
  ]);
  const preferredQualificationsText = extractSection(bodyText, [
    'preferred qualifications',
    'nice to have'
  ]);

  return {
    id: crypto.randomUUID(),
    title: limitText(title || doc.title || 'Untitled job', 180),
    company: limitOptionalText(company, 180),
    location: limitOptionalText(location, 180),
    salaryText,
    remoteStatus,
    descriptionText: bodyText.slice(0, maxDescriptionTextLength),
    requirementsText,
    preferredQualificationsText,
    detectedKeywords: detectKeywords(bodyText),
    sourceUrl: normalizeSourceUrl(doc.location.href),
    sourceSite: doc.location.hostname,
    dateFound: new Date().toISOString()
  };
}

function extractJobDescriptionText(doc: Document): string {
  const budget: TextTraversalBudget = {
    remainingNodes: maxDescriptionTextNodes,
    remainingCharacters: maxDescriptionTextLength * maxDescriptionCandidates
  };
  const seenCandidates = new Set<HTMLElement>();
  let candidatesScanned = 0;
  let bestText = '';

  for (const selector of descriptionSelectors) {
    const candidateScan = scanElements(doc, selector, maxDescriptionCandidates);
    for (const element of candidateScan.elements) {
      if (seenCandidates.has(element)) continue;
      if (candidatesScanned >= maxDescriptionCandidates)
        return bestText || sanitizedText(doc.body, budget);
      seenCandidates.add(element);
      candidatesScanned += 1;
      if (!isVisible(element)) continue;

      const text = sanitizedText(element, budget);
      if (text.length >= 160 && text.length > bestText.length) bestText = text;
      if (bestText.length >= maxDescriptionTextLength) return bestText;
      if (budget.remainingNodes <= 0 || budget.remainingCharacters <= 0) return bestText;
    }
    if (candidateScan.truncated) return bestText || sanitizedText(doc.body, budget);
  }

  return bestText || (doc.body ? sanitizedText(doc.body, budget) : '');
}

function sanitizedText(element: HTMLElement | null, budget: TextTraversalBudget): string {
  if (!element) return '';
  return boundedElementText(element, maxDescriptionTextLength, budget, true);
}

function firstText(doc: Document, selectors: string[]): string | undefined {
  const budget: TextTraversalBudget = {
    remainingNodes: maxMetadataTextNodes,
    remainingCharacters: maxMetadataTextLength * maxMetadataCandidates
  };
  let candidatesScanned = 0;
  for (const selector of selectors) {
    const candidateScan = scanElements(doc, selector, maxMetadataCandidates);
    for (const element of candidateScan.elements) {
      if (candidatesScanned >= maxMetadataCandidates || budget.remainingNodes <= 0)
        return undefined;
      candidatesScanned += 1;
      if (!isVisible(element)) continue;
      const value = boundedElementText(element, maxMetadataTextLength, budget, true);
      if (value) return value;
    }
    if (candidateScan.truncated) return undefined;
  }
  return undefined;
}

function scanElements(
  doc: Document,
  selector: string,
  limit: number
): { elements: HTMLElement[]; truncated: boolean } {
  const nodeFilter = doc.defaultView?.NodeFilter;
  if (!nodeFilter || limit <= 0) return { elements: [], truncated: false };

  const walker = doc.createTreeWalker(doc.documentElement ?? doc, nodeFilter.SHOW_ELEMENT);
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

function boundedElementText(
  element: HTMLElement,
  maxLength: number,
  budget: TextTraversalBudget,
  removeNonContent: boolean
): string {
  if (budget.remainingNodes <= 0 || budget.remainingCharacters <= 0) return '';

  const maxCharacters = Math.min(maxLength, budget.remainingCharacters);
  let text = '';
  let node: Node | null = element;

  while (node && budget.remainingNodes > 0 && text.length < maxCharacters) {
    budget.remainingNodes -= 1;
    if (node.nodeType === 3) {
      const fragment = (node.nodeValue ?? '').slice(0, maxCharacters - text.length);
      text += fragment;
      budget.remainingCharacters -= fragment.length;
    }

    const skipChildren =
      removeNonContent &&
      node !== element &&
      node.nodeType === 1 &&
      (node as Element).matches(removableContentSelector);
    node = nextNodeWithinRoot(node, element, skipChildren);
  }

  return normalizeWhitespace(text).slice(0, maxLength);
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

function detectRemoteStatus(text: string): JobPosting['remoteStatus'] {
  const key = text.toLowerCase();
  if (
    /\b(?:not|no)\s+(?:a\s+)?(?:fully\s+)?remote\b/.test(key) ||
    /\bremote\s+(?:work|option|positions?|role)\s+(?:is\s+|are\s+)?not\s+available\b/.test(key) ||
    /\bmust\s+(?:work|be)\s+(?:on[- ]?site|in[- ]?office)\b/.test(key) ||
    /\bon[- ]site only\b/.test(key)
  ) {
    return 'onsite';
  }
  if (/\bhybrid\b/.test(key)) return 'hybrid';
  if (/\bremote\b/.test(key)) return 'remote';
  if (/\bon[- ]?site\b|\bonsite\b/.test(key)) return 'onsite';
  return 'unknown';
}

function extractSection(text: string, headings: string[]): string | undefined {
  const lower = text.toLowerCase();
  const matches = headings
    .map((heading) => ({ heading, index: findHeadingIndex(lower, heading) }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index);
  const first = matches[0];
  if (!first) return undefined;

  const laterHeading = [
    'responsibilities',
    'requirements',
    'qualifications',
    'preferred qualifications',
    'nice to have',
    'benefits',
    'compensation',
    'about the company',
    'how to apply'
  ]
    .map((heading) => findHeadingIndex(lower, heading, first.index + first.heading.length))
    .filter((index) => index > first.index)
    .sort((left, right) => left - right)[0];

  const end = Math.min(laterHeading ?? first.index + 2500, first.index + 2500);
  return text.slice(first.index, end).trim() || undefined;
}

function findHeadingIndex(text: string, heading: string, fromIndex = 0): number {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const match = new RegExp(`(^|[\\n\\r]|[.!?]\\s+)${escaped}(?=\\s|:|$)`, 'i').exec(
    text.slice(fromIndex)
  );
  return match?.index === undefined ? -1 : fromIndex + match.index + match[1].length;
}

function detectKeywords(text: string): string[] {
  const key = text.toLowerCase();
  return uniqueStrings(
    keywordTerms.filter((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(key);
    })
  );
}

function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((name) =>
      url.searchParams.delete(name)
    );
    return url.toString();
  } catch {
    return value;
  }
}

function isVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  let depth = 0;
  while (current && depth < 100) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      current.hasAttribute('hidden') ||
      current.getAttribute('aria-hidden') === 'true' ||
      style?.display === 'none' ||
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

function limitText(value: string, maxLength: number): string {
  return normalizeWhitespace(value.slice(0, maxLength * 2)).slice(0, maxLength);
}

function limitOptionalText(value: string | undefined, maxLength: number): string | undefined {
  const limited = limitText(value ?? '', maxLength);
  return limited || undefined;
}
