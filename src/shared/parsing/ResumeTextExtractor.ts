import { err, ok, type Result } from '../utils/Result';

export function extractPlainTextFromPaste(value: string): Result<string> {
  const text = normalizeResumeText(value);
  if (text.length < 20) {
    return err('Resume text is too short to parse safely.');
  }
  return ok(text);
}

const headingAliases = [
  'Professional Summary',
  'Career Summary',
  'Professional Profile',
  'Technical Skills',
  'Core Skills',
  'Programming Languages',
  'Work Experience',
  'Professional Experience',
  'Employment History',
  'Relevant Experience',
  'Project Experience',
  'Academic Background',
  'Selected Projects',
  'Technical Projects',
  'Portfolio Projects',
  'Certifications',
  'Certificates',
  'Licenses',
  'Training',
  'Summary',
  'Profile',
  'About',
  'Skills',
  'Technologies',
  'Tools',
  'Languages',
  'Platforms',
  'Databases',
  'Frameworks',
  'Experience',
  'Education',
  'Degrees',
  'Projects'
];

const gluedLabels = [
  'Email',
  'Phone',
  'LinkedIn',
  'GitHub',
  'Portfolio',
  'Location',
  'Summary',
  'Professional Summary',
  'Technical Skills',
  'Professional Experience',
  'Education',
  'Certifications',
  'Projects'
];

export function normalizeResumeText(value: string): string {
  let text = value
    .split(String.fromCharCode(0))
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[•●▪]/g, '\n- ')
    .replace(/\n{3,}/g, '\n\n');

  for (const label of gluedLabels) {
    text = text.replace(
      new RegExp(`(?<!^)(?<!\\n)(?<![A-Za-z0-9./])(${escapeRegExp(label)}:?)(?=\\S)`, 'g'),
      '\n$1 '
    );
  }

  for (const heading of headingAliases.sort((a, b) => b.length - a.length)) {
    text = text.replace(
      new RegExp(`(^|\\n|\\s)(${escapeRegExp(heading)})(:?)(?=\\s|[A-Z])`, 'gi'),
      (_match, prefix: string, found: string, colon: string) =>
        `${prefix.trim() ? `${prefix.trimEnd()}\n` : prefix}${found}${colon}\n`
    );
  }

  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
