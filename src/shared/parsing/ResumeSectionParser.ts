import type { ProfileEducation, ProfileExperience, UserProfile } from '../models/UserProfile';
import { normalizeWhitespace, uniqueStrings } from '../utils/Validation';

export interface ParsedResume {
  profile: UserProfile;
  warnings: { section: string; message: string }[];
}

const sectionNames = ['summary', 'skills', 'experience', 'education', 'certifications'];

export function parseResumeSections(text: string): ParsedResume {
  const normalized = text.replace(/\r\n/g, '\n');
  const sections = splitSections(normalized);
  const contact = parseContact(normalized);
  const skills = parseSkills(sections.skills ?? '');
  const experience = parseExperience(sections.experience ?? '');
  const education = parseEducation(sections.education ?? '');
  const certifications = parseList(sections.certifications ?? '');
  const warnings = [];

  if (!skills.length) {
    warnings.push({ section: 'skills', message: 'No clear skills section found.' });
  }
  if (!experience.length) {
    warnings.push({ section: 'experience', message: 'No clear experience entries found.' });
  }

  return {
    profile: {
      id: 'default',
      contact,
      summary: normalizeWhitespace(sections.summary ?? ''),
      skills,
      experience,
      education,
      certifications,
      updatedAt: new Date().toISOString()
    },
    warnings
  };
}

function splitSections(text: string): Record<string, string> {
  const lines = text.split('\n');
  const sections: Record<string, string[]> = {};
  let current = 'summary';

  for (const line of lines) {
    const key = line.trim().toLowerCase().replace(/:$/, '');
    if (sectionNames.includes(key)) {
      current = key;
      sections[current] ??= [];
      continue;
    }
    sections[current] ??= [];
    sections[current].push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([key, value]) => [key, value.join('\n').trim()])
  );
}

function parseContact(text: string): UserProfile['contact'] {
  const lines = text.split('\n').map(normalizeWhitespace).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0];
  const linkedInUrl = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0];
  const githubUrl = text.match(/https?:\/\/(?:www\.)?github\.com\/[^\s)]+/i)?.[0];
  const fullName = lines.find((line) => !line.includes('@') && !/\d{3}/.test(line));
  const [firstName, ...rest] = (fullName ?? '').split(' ');

  return {
    fullName,
    firstName,
    lastName: rest.at(-1),
    email,
    phone,
    linkedInUrl,
    githubUrl
  };
}

function parseSkills(section: string): string[] {
  return uniqueStrings(section.split(/[,|•\n]/).map((value) => value.replace(/^[-*]\s*/, '')));
}

function parseList(section: string): string[] {
  return uniqueStrings(section.split(/\n|•/).map((value) => value.replace(/^[-*]\s*/, '')));
}

function parseExperience(section: string): ProfileExperience[] {
  const entries = section
    .split(/\n(?=[A-Z][^\n]+(?: at | - |, ))/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.map((entry) => {
    const lines = entry.split('\n').map(normalizeWhitespace).filter(Boolean);
    const header = lines.shift() ?? 'Experience';
    const [titlePart, employerPart] = header.split(/\s+(?:at|-|,)\s+/, 2);
    return {
      title: titlePart || 'Role',
      employer: employerPart || 'Employer',
      highlights: lines.map((line) => line.replace(/^[-*]\s*/, ''))
    };
  });
}

function parseEducation(section: string): ProfileEducation[] {
  return parseList(section).map((line) => {
    const commaParts = line.split(',').map(normalizeWhitespace);
    if (commaParts.length >= 2) {
      return { school: commaParts.slice(1).join(', '), degree: commaParts[0] };
    }
    const [degree, school] = line.split(/\s+(?:at|-|,)\s+/, 2);
    return { school: school || line, degree: school ? degree : undefined };
  });
}
