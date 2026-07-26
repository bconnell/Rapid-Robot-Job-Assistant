import type { FieldMapping, FillPreviewItem } from '../models/FieldMapping';
import type { ProfileEducation, ProfileExperience, UserProfile } from '../models/UserProfile';

export interface ResolvedProfileValue {
  value?: string;
  warning?: string;
}

export function resolveProfileValue(
  mapping: FieldMapping,
  profile?: UserProfile
): ResolvedProfileValue {
  if (!profile) return { warning: 'No active profile selected.' };

  const contact = profile.contact;
  switch (mapping.kind) {
    case 'firstName':
      return valueOrWarning(
        contact.firstName ?? splitName(contact.fullName).firstName,
        'No saved first name.'
      );
    case 'lastName':
      return valueOrWarning(
        contact.lastName ?? splitName(contact.fullName).lastName,
        'No saved last name.'
      );
    case 'fullName':
      return valueOrWarning(
        contact.fullName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' '),
        'No saved full name.'
      );
    case 'email':
      return valueOrWarning(contact.email, 'No saved email.');
    case 'phone':
      return valueOrWarning(contact.phone, 'No saved phone.');
    case 'city':
      return valueOrWarning(contact.city, 'No saved city.');
    case 'state':
      return valueOrWarning(contact.state, 'No saved state.');
    case 'zip':
      return valueOrWarning(contact.zip, 'No saved zip.');
    case 'linkedInUrl':
      return valueOrWarning(contact.linkedInUrl, 'No saved LinkedIn URL.');
    case 'githubUrl':
      return valueOrWarning(contact.githubUrl, 'No saved GitHub URL.');
    case 'portfolioUrl':
      return valueOrWarning(contact.portfolioUrl, 'No saved portfolio URL.');
    case 'workAuthorization':
      return valueOrWarning(profile.workAuthorization, 'No saved work authorization answer.');
    case 'sponsorship':
      return valueOrWarning(
        profile.sponsorshipRequired === undefined
          ? undefined
          : profile.sponsorshipRequired
            ? 'Yes'
            : 'No',
        'No saved sponsorship answer.'
      );
    case 'desiredSalary':
      return valueOrWarning(profile.desiredSalary, 'No saved desired salary.');
    case 'earliestStartDate':
      return valueOrWarning(profile.earliestStartDate, 'No saved earliest start date.');
    case 'education':
      return valueOrWarning(
        profile.education
          .map((item) => [item.degree, item.field, item.school].filter(Boolean).join(', '))
          .join('\n'),
        'No saved education.'
      );
    case 'workExperience':
      return valueOrWarning(
        profile.experience.map((item) => `${item.title} at ${item.employer}`).join('\n'),
        'No saved work experience.'
      );
    case 'currentEmployer':
      return valueOrWarning(
        findCurrentExperience(profile.experience)?.employer,
        'No saved current employer.'
      );
    case 'yearsExperience':
      return valueOrWarning(
        calculateYearsExperience(profile.experience),
        'No dated work experience.'
      );
    case 'remotePreference':
      return valueOrWarning(profile.remotePreference, 'No saved remote preference.');
    case 'availability':
      return valueOrWarning(profile.earliestStartDate, 'No saved availability answer.');
    case 'highestDegree':
      return valueOrWarning(
        findHighestDegree(profile.education)?.degree,
        'No saved highest degree.'
      );
    default:
      return { warning: 'No saved value for this field type.' };
  }
}

export function buildFillPreview(
  mappings: FieldMapping[],
  profile?: UserProfile
): FillPreviewItem[] {
  return mappings.map((mapping) => {
    const resolved = resolveProfileValue(mapping, profile);
    const manualOnlyReason = getManualOnlyReason(mapping);
    const manualOnly = Boolean(manualOnlyReason);
    const canApprove = Boolean(resolved.value?.trim()) && mapping.fillable && !manualOnly;
    return {
      ...mapping,
      value: resolved.value,
      approved: false,
      rejected: !canApprove,
      status: manualOnly ? 'manual-only' : canApprove ? 'pending' : 'rejected',
      warning: [mapping.warning, resolved.warning, manualOnlyReason].filter(Boolean).join(' ')
    };
  });
}

export function getManualOnlyReason(mapping: FieldMapping): string | undefined {
  const candidate = mapping.candidate;
  if (!candidate.visible) return 'Hidden fields are not filled.';
  if (candidate.disabled) return 'Disabled fields are not filled.';
  if (candidate.readOnly) return 'Read-only fields are not filled.';
  if (candidate.stableSelector === false) {
    return 'Manual review required because no stable selector was found.';
  }
  if (
    candidate.inputType === 'file' ||
    mapping.kind === 'resumeUpload' ||
    mapping.kind === 'coverLetterUpload'
  ) {
    return 'File uploads require manual selection.';
  }
  if (candidate.controlFamily === 'native-multi-select') {
    return 'Multiple-choice select fields require manual review.';
  }
  if (
    candidate.controlFamily === 'aria-combobox' ||
    candidate.controlFamily === 'custom-select' ||
    candidate.controlFamily === 'unknown-widget' ||
    candidate.candidateSource === 'aria-widget'
  ) {
    return 'Custom widgets are manual-only in this version.';
  }
  return undefined;
}

function valueOrWarning(value: string | undefined, warning: string): ResolvedProfileValue {
  return value?.trim() ? { value: value.trim() } : { warning };
}

function splitName(fullName?: string): { firstName?: string; lastName?: string } {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return {};
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.at(-1) : undefined
  };
}

function findCurrentExperience(items: ProfileExperience[]): ProfileExperience | undefined {
  const current = items.find((item) => {
    const end = item.endDate?.trim().toLowerCase();
    return !end || end === 'present' || end === 'current';
  });
  if (current) return current;

  return [...items].sort(
    (left, right) =>
      parseDate(right.endDate ?? right.startDate) - parseDate(left.endDate ?? left.startDate)
  )[0];
}

function findHighestDegree(items: ProfileEducation[]): ProfileEducation | undefined {
  return [...items].sort((left, right) => degreeRank(right.degree) - degreeRank(left.degree))[0];
}

function degreeRank(value?: string): number {
  const degree = value?.toLowerCase() ?? '';
  if (/\b(phd|ph\.d|doctor|doctorate|jd|j\.d|md|m\.d)\b/.test(degree)) return 5;
  if (/\b(master|mba|ms|m\.s|ma|m\.a)\b/.test(degree)) return 4;
  if (/\b(bachelor|bs|b\.s|ba|b\.a)\b/.test(degree)) return 3;
  if (/\b(associate|as|a\.s|aa|a\.a)\b/.test(degree)) return 2;
  if (/\b(certificate|certification|diploma)\b/.test(degree)) return 1;
  return degree ? 0 : -1;
}

function calculateYearsExperience(items: ProfileExperience[]): string | undefined {
  const intervals = items
    .map((item) => {
      const start = parseDate(item.startDate);
      const end = isCurrentEndDate(item.endDate) ? Date.now() : parseDate(item.endDate);
      return start && end > start ? { start, end } : undefined;
    })
    .filter((item): item is { start: number; end: number } => Boolean(item))
    .sort((left, right) => left.start - right.start);

  if (!intervals.length) return undefined;

  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }

  const months = merged.reduce(
    (total, interval) =>
      total +
      Math.max(0, Math.round((interval.end - interval.start) / (30.4375 * 24 * 60 * 60 * 1000))),
    0
  );
  if (!months) return undefined;
  if (months < 12) return 'Less than 1 year';
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year' : `${years} years`;
}

function isCurrentEndDate(value?: string): boolean {
  const key = value?.trim().toLowerCase();
  return !key || key === 'present' || key === 'current';
}

function parseDate(value?: string): number {
  if (!value?.trim()) return 0;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const year = value.match(/\b(?:19|20)\d{2}\b/)?.[0];
  return year ? Date.parse(`${year}-01-01T00:00:00.000Z`) : 0;
}
