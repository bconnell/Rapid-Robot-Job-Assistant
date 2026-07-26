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
    descriptionText: bodyText.slice(0, 12000),
    requirementsText,
    preferredQualificationsText,
    detectedKeywords: detectKeywords(bodyText),
    sourceUrl: normalizeSourceUrl(doc.location.href),
    sourceSite: doc.location.hostname,
    dateFound: new Date().toISOString()
  };
}

function extractJobDescriptionText(doc: Document): string {
  for (const selector of descriptionSelectors) {
    const candidates = Array.from(doc.querySelectorAll<HTMLElement>(selector))
      .filter(isVisible)
      .map((element) => sanitizedText(element))
      .filter((text) => text.length >= 160)
      .sort((left, right) => right.length - left.length);
    if (candidates[0]) return candidates[0];
  }

  return doc.body ? sanitizedText(doc.body) : '';
}

function sanitizedText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(removableContentSelector).forEach((item) => item.remove());
  return normalizeWhitespace(clone.textContent ?? '');
}

function firstText(doc: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const element = Array.from(doc.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    const value = normalizeWhitespace(element?.textContent ?? '');
    if (value) return value;
  }
  return undefined;
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
  while (current) {
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
  }
  return true;
}

function limitText(value: string, maxLength: number): string {
  return normalizeWhitespace(value).slice(0, maxLength);
}

function limitOptionalText(value: string | undefined, maxLength: number): string | undefined {
  const limited = limitText(value ?? '', maxLength);
  return limited || undefined;
}
