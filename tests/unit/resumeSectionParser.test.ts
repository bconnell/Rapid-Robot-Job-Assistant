import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseResumeSections } from '../../src/shared/parsing/ResumeSectionParser';

describe('parseResumeSections', () => {
  it('parses fake resume contact, skills, experience, and education', () => {
    const text = readFileSync(resolve('tests/fixtures/resumes/fake-basic-resume.txt'), 'utf8');
    const parsed = parseResumeSections(text);

    expect(parsed.profile.contact.email).toBe('alex@example.com');
    expect(parsed.profile.skills).toContain('TypeScript');
    expect(parsed.profile.experience[0].employer).toBe('Example Tools');
    expect(parsed.profile.education[0].school).toBe('Example State University');
  });
});
