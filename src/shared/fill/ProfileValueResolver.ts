import type { FieldMapping, FillPreviewItem } from '../models/FieldMapping';
import type { UserProfile } from '../models/UserProfile';

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
      return valueOrWarning(contact.fullName, 'No saved full name.');
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
          .map((item) => [item.degree, item.school].filter(Boolean).join(', '))
          .join('\n'),
        'No saved education.'
      );
    case 'workExperience':
      return valueOrWarning(
        profile.experience.map((item) => `${item.title} at ${item.employer}`).join('\n'),
        'No saved work experience.'
      );
    case 'currentEmployer':
      return valueOrWarning(profile.experience[0]?.employer, 'No saved current employer.');
    case 'remotePreference':
      return valueOrWarning(profile.remotePreference, 'No saved remote preference.');
    case 'availability':
      return valueOrWarning(profile.earliestStartDate, 'No saved availability answer.');
    case 'highestDegree':
      return valueOrWarning(profile.education[0]?.degree, 'No saved highest degree.');
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
    const canApprove = Boolean(resolved.value) && mapping.fillable && !manualOnly;
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
  return value?.trim() ? { value } : { warning };
}

function splitName(fullName?: string): { firstName?: string; lastName?: string } {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }
  return {};
}
