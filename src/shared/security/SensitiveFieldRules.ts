import type { FieldMappingKind } from '../models/FieldMapping';
import { normalizeKey } from '../utils/Validation';

const sensitiveTerms = [
  'gender',
  'race',
  'ethnicity',
  'disability',
  'veteran',
  'gender identity',
  'hispanic',
  'latino',
  'pronouns',
  'protected',
  'ssn',
  'social security',
  'date of birth',
  'birth date',
  'criminal',
  'background check',
  'sponsorship',
  'authorization',
  'authorized to work',
  'voluntary self-identification'
];

const sensitiveKinds: FieldMappingKind[] = [
  'voluntaryDemographic',
  'disability',
  'veteranStatus',
  'gender',
  'race',
  'ethnicity',
  'pronouns',
  'workAuthorization',
  'sponsorship'
];

export function isSensitiveFieldText(value: string): boolean {
  const key = normalizeKey(value);
  return sensitiveTerms.some((term) => key.includes(term));
}

export function isSensitiveMappingKind(kind: FieldMappingKind): boolean {
  return sensitiveKinds.includes(kind);
}
