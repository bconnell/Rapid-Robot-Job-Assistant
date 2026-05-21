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

export function extractJobPostingFromDocument(doc: Document = document): JobPosting {
  const title = firstText(doc, [
    '[data-testid*="job-title" i]',
    '[class*="job-title" i]',
    'h1',
    'title'
  ]);
  const company = firstText(doc, [
    '[data-testid*="company" i]',
    '[class*="company" i]',
    '[aria-label*="company" i]'
  ]);
  const location = firstText(doc, [
    '[data-testid*="location" i]',
    '[class*="location" i]',
    '[aria-label*="location" i]'
  ]);
  const bodyText = normalizeWhitespace(doc.body?.innerText ?? '');
  const salaryText = bodyText.match(
    /\$\d[\d,]*(?:\s*-\s*\$?\d[\d,]*)?(?:\s*(?:\/|per)\s*(?:year|hour|yr|hr))?/i
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
    title: title || doc.title || 'Untitled job',
    company,
    location,
    salaryText,
    remoteStatus,
    descriptionText: bodyText.slice(0, 12000),
    requirementsText,
    preferredQualificationsText,
    detectedKeywords: detectKeywords(bodyText),
    sourceUrl: doc.location.href,
    sourceSite: doc.location.hostname,
    dateFound: new Date().toISOString()
  };
}

function firstText(doc: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = normalizeWhitespace(doc.querySelector(selector)?.textContent ?? '');
    if (value) {
      return value;
    }
  }
  return undefined;
}

function detectRemoteStatus(text: string): JobPosting['remoteStatus'] {
  const key = text.toLowerCase();
  if (key.includes('hybrid')) return 'hybrid';
  if (key.includes('remote')) return 'remote';
  if (key.includes('on-site') || key.includes('onsite')) return 'onsite';
  return 'unknown';
}

function extractSection(text: string, headings: string[]): string | undefined {
  const lower = text.toLowerCase();
  const start = headings.map((heading) => lower.indexOf(heading)).find((index) => index >= 0);
  if (start === undefined) return undefined;
  return text.slice(start, start + 2500);
}

function detectKeywords(text: string): string[] {
  const key = text.toLowerCase();
  return uniqueStrings(keywordTerms.filter((term) => key.includes(term)));
}
