import type { ProfileEducation, ProfileExperience, UserProfile } from '../models/UserProfile';
import { normalizeWhitespace, uniqueStrings } from '../utils/Validation';
import { normalizeResumeText } from './ResumeTextExtractor';

export interface ParsedResume {
  profile: UserProfile;
  warnings: { section: string; message: string }[];
  summary: ResumeParseSummary;
}

export interface ResumeParseSummary {
  contactFound: boolean;
  summaryFound: boolean;
  skillsCount: number;
  experienceCount: number;
  educationCount: number;
  certificationsCount: number;
  guessedSections: string[];
  needsReview: string[];
}

type SectionKey = 'summary' | 'skills' | 'experience' | 'education' | 'certifications' | 'projects';

const sectionAliases: Record<SectionKey, string[]> = {
  summary: [
    'summary',
    'professional summary',
    'profile',
    'professional profile',
    'career summary',
    'about'
  ],
  skills: [
    'skills',
    'technical skills',
    'core skills',
    'technologies',
    'tools',
    'languages',
    'programming languages',
    'platforms',
    'databases',
    'frameworks'
  ],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'employment history',
    'relevant experience',
    'project experience'
  ],
  education: ['education', 'academic background', 'degrees'],
  certifications: ['certifications', 'certificates', 'licenses', 'training'],
  projects: ['projects', 'selected projects', 'technical projects', 'portfolio projects']
};

const datePattern =
  /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\s*(?:-|\u2013|to)\s*(?:present|current|(?:19|20)\d{2})|\b(?:expected\s+)?(?:graduation\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d{2}|\b(?:19|20)\d{2}\b/i;

export function parseResumeSections(text: string): ParsedResume {
  const normalized = normalizeResumeText(text);
  const { sections, guessedSections } = splitSections(normalized);
  const contact = parseContact(normalized);
  const skills = parseSkills(sections.skills ?? '');
  const experience = parseExperience(sections.experience ?? '');
  const education = parseEducation(sections.education ?? '');
  const certifications = parseList(sections.certifications ?? '');
  const warnings: ParsedResume['warnings'] = [];

  if (!contact.fullName) warnings.push({ section: 'contact', message: 'Name needs review.' });
  if (!contact.email) warnings.push({ section: 'contact', message: 'Email was not found.' });
  if (!skills.length)
    warnings.push({ section: 'skills', message: 'No clear skills section found.' });
  if (!experience.length) {
    warnings.push({ section: 'experience', message: 'No clear experience entries found.' });
  }
  for (const section of guessedSections) {
    warnings.push({ section, message: `${section} section was guessed from nearby text.` });
  }

  const summary = cleanSummary(sections.summary ?? '');

  return {
    profile: {
      id: 'default',
      contact,
      summary,
      skills,
      experience,
      education,
      certifications,
      projects: [],
      desiredTitles: [],
      updatedAt: new Date().toISOString()
    },
    warnings: dedupeWarnings(warnings),
    summary: {
      contactFound: Boolean(contact.fullName || contact.email || contact.phone),
      summaryFound: Boolean(summary),
      skillsCount: skills.length,
      experienceCount: experience.length,
      educationCount: education.length,
      certificationsCount: certifications.length,
      guessedSections,
      needsReview: dedupeWarnings(warnings).map((warning) => warning.message)
    }
  };
}

function splitSections(text: string): {
  sections: Partial<Record<SectionKey, string>>;
  guessedSections: string[];
} {
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const guessedSections: string[] = [];
  let current: SectionKey | undefined;

  for (const rawLine of text.split('\n')) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;
    const heading = detectHeading(line);
    if (heading) {
      current = heading.key;
      sections[current] ??= [];
      if (heading.guessed) guessedSections.push(heading.key);
      const remainder = heading.remainder.trim();
      if (remainder) sections[current]?.push(remainder);
      continue;
    }
    if (current) sections[current]?.push(line);
  }

  return {
    sections: Object.fromEntries(
      Object.entries(sections).map(([key, value]) => [key, value.join('\n').trim()])
    ) as Partial<Record<SectionKey, string>>,
    guessedSections: uniqueStrings(guessedSections)
  };
}

function detectHeading(
  line: string
): { key: SectionKey; remainder: string; guessed: boolean } | undefined {
  const cleaned = normalizeWhitespace(line.replace(/:$/, ''));
  const lower = cleaned.toLowerCase();
  for (const [key, aliases] of Object.entries(sectionAliases) as Array<[SectionKey, string[]]>) {
    const alias = aliases.find(
      (candidate) => lower === candidate || lower.startsWith(`${candidate}:`)
    );
    if (alias)
      return { key, remainder: cleaned.slice(alias.length).replace(/^:/, ''), guessed: false };
  }

  for (const [key, aliases] of Object.entries(sectionAliases) as Array<[SectionKey, string[]]>) {
    const alias = aliases.find(
      (candidate) => lower.startsWith(`${candidate} `) && line.length < 90
    );
    if (alias) return { key, remainder: cleaned.slice(alias.length), guessed: true };
  }
  return undefined;
}

function parseContact(text: string): UserProfile['contact'] {
  const lines = text.split('\n').map(normalizeWhitespace).filter(Boolean);
  const email = extractEmail(text);
  const phone = extractPhone(text);
  const linkedInUrl = extractLink(text, 'linkedin.com');
  const githubUrl = extractLink(text, 'github.com');
  const location = extractLocation(lines);
  const fullName = extractName(lines);
  const [firstName, ...rest] = (fullName ?? '').split(/\s+/);

  return {
    fullName,
    firstName: firstName || undefined,
    lastName: rest.length ? rest.at(-1) : undefined,
    email,
    phone,
    linkedInUrl,
    githubUrl,
    ...location
  };
}

function extractEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.(?:com|org|net|edu|io|co|dev|me|us)/i)?.[0];
}

function extractPhone(text: string): string | undefined {
  const match = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return match?.[0];
}

function extractLink(text: string, host: 'linkedin.com' | 'github.com'): string | undefined {
  const lower = text.toLowerCase();
  const hostIndex = lower.indexOf(host);
  if (hostIndex < 0) return undefined;
  const protocolStart = lower.lastIndexOf('https://', hostIndex);
  const wwwStart = lower.lastIndexOf('www.', hostIndex);
  const start =
    protocolStart >= 0 && hostIndex - protocolStart < 12
      ? protocolStart
      : wwwStart >= 0 && hostIndex - wwwStart < 5
        ? wwwStart
        : hostIndex;
  const raw = text
    .slice(start)
    .split(/\s|\||,|\)|(?=Email|Phone|LinkedIn|GitHub|Portfolio|Summary|Skills)/i)[0];
  const cleaned = raw.replace(/[.,;:]+$/, '');
  return cleaned.startsWith('http') ? cleaned : `https://${cleaned}`;
}

function extractLocation(lines: string[]): Pick<UserProfile['contact'], 'city' | 'state' | 'zip'> {
  if (lines.some((line) => /^remote$/i.test(line))) return { city: 'Remote' };
  for (const line of lines.slice(0, 8)) {
    const match = line.match(
      /\b([A-Z][A-Za-z .'-]+),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(\d{5})?\b/
    );
    if (match && !line.includes('@')) {
      return { city: match[1].trim(), state: match[2].trim(), zip: match[3] };
    }
  }
  return {};
}

function extractName(lines: string[]): string | undefined {
  const sectionWords = Object.values(sectionAliases).flat();
  return lines.find((line) => {
    const lower = line.toLowerCase();
    return (
      line.length <= 45 &&
      /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(line) &&
      !line.includes('@') &&
      !/\d/.test(line) &&
      !sectionWords.includes(lower) &&
      !/(engineer|developer|manager|analyst|consultant|remote|resume)/i.test(line)
    );
  });
}

function cleanSummary(section: string): string {
  const lines = section.split('\n').map(normalizeWhitespace).filter(Boolean);
  return normalizeWhitespace(lines.filter((line) => !isContactLike(line)).join(' ')).slice(0, 900);
}

function parseSkills(section: string): string[] {
  const values = section
    .split(/\n|,|\||;|\u2022/)
    .map((value) =>
      value
        .replace(/^[-*]\s*/, '')
        .replace(/^(languages|frameworks|databases|tools|platforms|technologies):/i, '')
        .trim()
    )
    .filter(
      (value) =>
        value.length > 1 && value.length < 45 && !isContactLike(value) && !detectHeading(value)
    );
  return uniqueStrings(values);
}

function parseList(section: string): string[] {
  return uniqueStrings(
    section
      .split(/\n|\u2022/)
      .map((value) => value.replace(/^[-*]\s*/, '').trim())
      .filter((value) => Boolean(value) && !detectHeading(value))
  );
}

function parseExperience(section: string): ProfileExperience[] {
  const lines = section.split('\n').map(normalizeWhitespace).filter(Boolean);
  const entries: ProfileExperience[] = [];
  let current: ProfileExperience | undefined;

  for (const line of lines) {
    if (/^[-*]/.test(line)) {
      current?.highlights.push(line.replace(/^[-*]\s*/, ''));
      continue;
    }
    if (looksLikeExperienceHeader(line)) {
      if (current) entries.push(current);
      current = parseExperienceHeader(line);
      continue;
    }
    if (current) current.highlights.push(line);
  }
  if (current) entries.push(current);
  return entries.filter((entry) => entry.title || entry.employer);
}

function looksLikeExperienceHeader(line: string): boolean {
  return (
    datePattern.test(line) ||
    /\s+at\s+/i.test(line) ||
    line.includes('|') ||
    /\s+-\s+/.test(line) ||
    /(engineer|developer|manager|analyst|consultant|specialist|designer|administrator)/i.test(line)
  );
}

function parseExperienceHeader(line: string): ProfileExperience {
  const date = line.match(datePattern)?.[0];
  const withoutDate = normalizeWhitespace(line.replace(datePattern, '').replace(/[|,;-]+$/, ''));
  let title = withoutDate;
  let employer = 'Needs review';
  const parts = withoutDate
    .split(/\s+\|\s+|\s+-\s+|\s*,\s*/)
    .map(normalizeWhitespace)
    .filter(Boolean);

  if (/\s+at\s+/i.test(withoutDate)) {
    [title, employer] = withoutDate.split(/\s+at\s+/i, 2);
  } else if (parts.length >= 2) {
    const firstLooksTitle =
      /(engineer|developer|manager|analyst|consultant|specialist|designer|administrator)/i.test(
        parts[0]
      );
    title = firstLooksTitle ? parts[0] : parts[1];
    employer = firstLooksTitle ? parts[1] : parts[0];
  }

  return {
    title: title || 'Needs review',
    employer: employer || 'Needs review',
    startDate: date,
    highlights: []
  };
}

function parseEducation(section: string): ProfileEducation[] {
  const entries: string[] = [];
  let current = '';

  for (const line of section.split('\n').map(normalizeWhitespace).filter(Boolean)) {
    if (detectHeading(line)) continue;
    const startsNew =
      current &&
      /(University|College|School|Institute|Bachelor|Master|Associate|Certificate|Degree|BS|MS|MBA)/i.test(
        line
      );
    if (startsNew) {
      entries.push(current);
      current = line;
    } else {
      current = normalizeWhitespace(`${current} ${line}`);
    }
  }
  if (current) entries.push(current);
  return entries.map(parseEducationLine).filter((entry) => entry.school || entry.degree);
}

function parseEducationLine(line: string): ProfileEducation {
  const normalizedLine = normalizeEducationLine(line);
  const graduationDate = line
    .match(
      /(?:expected\s+)?(?:graduation\s+)?(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)[a-z]*\.?\s+)?(?:19|20)\d{2}/i
    )?.[0]
    ?.trim();
  const cleaned = normalizeWhitespace(
    normalizedLine
      .replace(/magna cum laude|summa cum laude|cum laude|honors?/gi, '')
      .replace(graduationDate ?? '', '')
  );
  const degreeMatch = cleaned.match(
    /\b(?:(?:Master|Bachelor|Associate) of (?:Science|Arts|Applied Science|Business Administration)|(?:BS|BA|MS|MA|MBA|Certificate)(?:\s+[A-Z][A-Za-z&.' -]+)?)/i
  );
  const degreeRaw = normalizeEducationText(degreeMatch?.[0]);
  const degree =
    degreeRaw && /^(?:BS|BA|MS|MA|MBA|Certificate)\s+/i.test(degreeRaw)
      ? degreeRaw
      : degreeRaw?.replace(/\s+in\s+.+$/i, '');
  const degreeIndex = degreeMatch?.index ?? -1;
  const afterDegree =
    degreeRaw && degreeIndex >= 0 ? cleaned.slice(degreeIndex + degreeRaw.length) : '';
  const beforeDegree = degreeIndex > 0 ? cleaned.slice(0, degreeIndex) : '';
  const school = findSchoolName(cleaned, beforeDegree);
  const field =
    degreeRaw && afterDegree
      ? normalizeEducationText(
          afterDegree
            .trim()
            .replace(/^in\s+/i, '')
            .replace(school ?? '', '')
            .replace(/[|,;-]+$/g, '')
        )
      : degreeRaw && /^(?:BS|BA|MS|MA|MBA|Certificate)\s+/i.test(degreeRaw)
        ? normalizeEducationText(degreeRaw.replace(/^(?:BS|BA|MS|MA|MBA|Certificate)\s+/i, ''))
        : undefined;

  return {
    school: school || 'Needs review',
    degree,
    field: field || undefined,
    graduationDate
  };
}

function normalizeEducationLine(line: string): string {
  return normalizeWhitespace(
    line
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(
        /(University|College|School|Institute)(Expected|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December))/gi,
        '$1 $2'
      )
  );
}

function findSchoolName(line: string, fallback: string): string | undefined {
  const degreeStart = line.search(
    /\b(?:Master|Bachelor|Associate) of (?:Science|Arts|Applied Science|Business Administration)|\b(?:BS|BA|MS|MA|MBA|Certificate)\b/i
  );
  const searchText = degreeStart > 0 ? line.slice(0, degreeStart) : line;
  for (const match of searchText.matchAll(/\b(University|College|School|Institute)\b/g)) {
    const prefixWords = (
      searchText.slice(0, match.index).match(/\b[A-Z][A-Za-z&.'-]*\b/g) ?? []
    ).filter(
      (word) =>
        !/^(Master|Bachelor|Associate|Science|Arts|Applied|Business|Administration|Computer|Software|Engineering|Expected)$/i.test(
          word
        )
    );
    const nameWords = prefixWords.slice(-2);
    if (!nameWords.length) continue;
    const cityMatch = searchText
      .slice((match.index ?? 0) + match[0].length)
      .match(
        /^\s*-\s*(.+?)(?=\s+(?:Master|Bachelor|Associate|BS|BA|MS|MA|MBA|Certificate|Expected|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|19|20)|$|,|\|)/
      );
    return normalizeEducationText(
      `${nameWords.join(' ')} ${match[0]}${cityMatch?.[1] ? ` - ${cityMatch[1]}` : ''}`
    );
  }
  return normalizeEducationText(fallback);
}

function normalizeEducationText(value?: string): string | undefined {
  const cleaned = normalizeWhitespace((value ?? '').replace(/^[,|;-]+|[,|;-]+$/g, ''));
  return cleaned || undefined;
}

function isContactLike(value: string): boolean {
  return /@|linkedin\.com|github\.com|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/i.test(value);
}

function dedupeWarnings(warnings: ParsedResume['warnings']): ParsedResume['warnings'] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.section}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
