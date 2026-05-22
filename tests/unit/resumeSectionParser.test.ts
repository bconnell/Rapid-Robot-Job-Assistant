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

  it('handles section aliases and collapsed docx-style contact text', () => {
    const parsed = parseResumeSections(`
Alex Morgan
Chicago, Illinois 60601
Email alex@example.comLinkedIn linkedin.com/in/alex-exampleGitHub github.com/alex-example
Professional Summary
Frontend developer focused on accessible workflow tools.
Technical Skills
Languages: TypeScript, JavaScript
Frameworks: React | Vite
Databases: SQL
Professional Experience
Frontend Engineer | Northstar Components | Jan 2022 - Present
- Built internal React tools.
Software Developer, Lakeview Systems, 2020 - 2022
- Maintained TypeScript applications.
Education
BS Computer Science, Prairie State University, May 2020, Cum Laude
Certifications
Accessibility Foundations
`);

    expect(parsed.profile.contact.email).toBe('alex@example.com');
    expect(parsed.profile.contact.linkedInUrl).toBe('https://linkedin.com/in/alex-example');
    expect(parsed.profile.contact.githubUrl).toBe('https://github.com/alex-example');
    expect(parsed.profile.contact.city).toBe('Chicago');
    expect(parsed.profile.skills).toEqual(expect.arrayContaining(['TypeScript', 'React', 'SQL']));
    expect(parsed.profile.experience).toHaveLength(2);
    expect(parsed.profile.education[0]).toMatchObject({
      school: 'Prairie State University',
      degree: 'BS Computer Science',
      graduationDate: 'May 2020'
    });
    expect(parsed.summary.skillsCount).toBeGreaterThanOrEqual(3);
    expect(parsed.summary.experienceCount).toBe(2);
  });

  it('does not dump the whole resume into summary when sections are present', () => {
    const parsed = parseResumeSections(`
Jordan Lee
alex@example.com
Profile
Backend developer who writes clear APIs.
Core Skills
Node, SQL, Testing
Employment History
API Developer at Prairie Software Works 2021 - Present
- Built service integrations.
`);

    expect(parsed.profile.summary).toBe('Backend developer who writes clear APIs.');
    expect(parsed.profile.summary).not.toContain('Core Skills');
    expect(parsed.warnings.find((warning) => warning.section === 'skills')).toBeUndefined();
  });

  it('returns review warnings only for real uncertainty', () => {
    const parsed = parseResumeSections(`
Taylor Reed
Professional Summary
Builder of practical software tools.
Technical Skills
TypeScript, React
Education
Lakeview College, Certificate in Web Development, Expected 2026
`);

    expect(parsed.summary.needsReview).toContain('Email was not found.');
    expect(parsed.summary.needsReview).toContain('No clear experience entries found.');
    expect(parsed.summary.needsReview).not.toContain('No clear skills section found.');
  });

  it('separates glued education degree, field, school, and expected date', () => {
    const parsed = parseResumeSections(`
Taylor Reed
Professional Summary
Software developer.
Technical Skills
TypeScript, React
Professional Experience
Software Developer | Prairie Software Works | 2022 - Present
Education
Master of Science in Software EngineeringLakeview Technical University - River CityExpected August 2026
Bachelor of Science in Computer ScienceNorthstar State CollegeApril 2025
`);

    expect(parsed.profile.education[0]).toMatchObject({
      degree: 'Master of Science',
      field: 'Software Engineering',
      school: 'Lakeview Technical University - River City',
      graduationDate: 'Expected August 2026'
    });
    expect(parsed.profile.education[1]).toMatchObject({
      degree: 'Bachelor of Science',
      field: 'Computer Science',
      school: 'Northstar State College',
      graduationDate: 'April 2025'
    });
  });

  it('handles school-first education entries without duplicating fields', () => {
    const parsed = parseResumeSections(`
Alex Morgan
Professional Summary
Developer.
Technical Skills
SQL, Testing
Professional Experience
QA Analyst - Lakeview Systems - 2020 - 2024
Education
Lakeview Technical University - River City Master of Science in Software Engineering Expected August 2026
`);

    expect(parsed.profile.experience).toHaveLength(1);
    expect(parsed.profile.education[0]).toMatchObject({
      school: 'Lakeview Technical University - River City',
      degree: 'Master of Science',
      field: 'Software Engineering',
      graduationDate: 'Expected August 2026'
    });
  });

  it('does not let certifications consume later sections', () => {
    const parsed = parseResumeSections(`
Jordan Lee
Professional Summary
Practical builder.
Technical Skills
Node, SQL
Professional Experience
Developer | Northstar Components | 2021 - Present
Certifications
Lakeview Cloud Foundations
Projects
Inventory Dashboard
Education
Northstar State College, BS Computer Science, 2020
`);

    expect(parsed.profile.certifications).toEqual(['Lakeview Cloud Foundations']);
    expect(parsed.profile.certifications).not.toContain('Projects');
  });
});
