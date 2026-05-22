import { describe, expect, it } from 'vitest';
import { normalizeResumeText } from '../../src/shared/parsing/ResumeTextExtractor';

describe('normalizeResumeText', () => {
  it('adds useful breaks around collapsed labels and headings', () => {
    const normalized = normalizeResumeText(
      'Alex Morgan Emailalex@example.comLinkedIn linkedin.com/in/alex-exampleProfessional Summary Builds useful toolsTechnical Skills TypeScript|ReactProfessional Experience Frontend Developer | Northstar Components | 2022 - Present'
    );

    expect(normalized).toContain('Email');
    expect(normalized).toContain('Professional Summary');
    expect(normalized).toContain('Technical Skills');
    expect(normalized).toContain('Professional Experience');
    expect(normalized).toContain('linkedin.com/in/alex-example');
  });

  it('splits collapsed additional experience headings from docx-style text', () => {
    const normalized = normalizeResumeText(
      'CertificationsLakeview Cloud FoundationsAdditional ExperienceSoftware Developer | Prairie Software Works | 2022 - Present'
    );

    expect(normalized).toContain('Certifications\nLakeview Cloud Foundations');
    expect(normalized).toMatch(/Additional Experience\n+Software Developer/);
  });
});
