import { describe, expect, it } from 'vitest';
import { approveSafeHighConfidence } from '../../src/shared/fill/FillApprovalRules';
import { buildFillPreview, resolveProfileValue } from '../../src/shared/fill/ProfileValueResolver';
import type { FieldMapping } from '../../src/shared/models/FieldMapping';
import type { UserProfile } from '../../src/shared/models/UserProfile';

const profile: UserProfile = {
  id: 'profile-1',
  contact: {
    fullName: 'Alex Morgan',
    email: 'alex@example.com',
    linkedInUrl: 'https://www.linkedin.com/in/alex-example'
  },
  summary: 'Frontend developer',
  skills: ['TypeScript', 'React'],
  experience: [{ title: 'Frontend Developer', employer: 'Northstar Components', highlights: [] }],
  education: [{ school: 'Lakeview University', degree: 'BS Computer Science' }],
  certifications: [],
  projects: [],
  desiredTitles: [],
  workAuthorization: 'Authorized to work in the United States',
  sponsorshipRequired: false,
  desiredSalary: '$110,000',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const emailMapping: FieldMapping = {
  candidate: {
    selector: '#email',
    inputType: 'email',
    tagName: 'input',
    labelText: 'Email',
    options: [],
    required: true,
    visible: true
  },
  kind: 'email',
  confidence: 0.96,
  sensitive: false,
  fillable: true,
  requiresDirectReview: false
};

describe('ProfileValueResolver', () => {
  it('resolves profile values without inventing missing data', () => {
    expect(resolveProfileValue(emailMapping, profile).value).toBe('alex@example.com');
    expect(resolveProfileValue({ ...emailMapping, kind: 'phone' }, profile).warning).toBe(
      'No saved phone.'
    );
  });

  it('builds preview items and bulk-approves only safe high-confidence fields', () => {
    const sensitive = { ...emailMapping, kind: 'sponsorship' as const, sensitive: true };
    const preview = buildFillPreview([emailMapping, sensitive], profile);
    const approved = approveSafeHighConfidence(preview);

    expect(approved[0].approved).toBe(true);
    expect(approved[1].approved).toBe(false);
  });
});
