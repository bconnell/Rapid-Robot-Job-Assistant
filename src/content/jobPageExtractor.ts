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
    const element = doc.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const text = sanitizedText(element);
    if (text.length >= 200) return text;
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
    const value = normalizeWhitespace(doc.querySelector(selector)?.textContent ?? '');
    if (value) return value;
  }
  return undefined;
}

function detectRemoteStatus(text: string): JobPosting['remoteStatus'] {
  const key = text.toLowerCase();
  if (
    /\b(?:not|no)\s+(?:a\s+)?remote\b/.test(key) ||
    /remote (?:work|option|positions?) (?:is|are )?not available/.test(key) ||
    /on[- ]site only/.test(key)
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
  const starts = headings.map((heading) => lower.indexOf(heading)).filter((index) => index >= 0);
  if (!starts.length) return undefined;
  const start = Math.min(...starts);
  return text.slice(start, start + 2500);
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

function limitText(value: string, maxLength: number): string {
  return normalizeWhitespace(value).slice(0, maxLength);
}

function limitOptionalText(value: string | undefined, maxLength: number): string | undefined {
  const limited = limitText(value ?? '', maxLength);
  return limited || undefined;
}
