import type { FieldMapping, FieldMappingKind } from '../shared/models/FieldMapping';
import type { FormFieldCandidate } from '../shared/models/FormFieldCandidate';
import {
  isSensitiveFieldText,
  isSensitiveMappingKind
} from '../shared/security/SensitiveFieldRules';
import { normalizeKey } from '../shared/utils/Validation';

const rules: Array<{ kind: FieldMappingKind; terms: string[]; confidence: number }> = [
  { kind: 'firstName', terms: ['first name', 'given name', 'fname'], confidence: 0.95 },
  { kind: 'lastName', terms: ['last name', 'surname', 'lname'], confidence: 0.95 },
  { kind: 'email', terms: ['email', 'e-mail'], confidence: 0.96 },
  { kind: 'phone', terms: ['phone', 'mobile', 'telephone'], confidence: 0.94 },
  { kind: 'fullName', terms: ['full name', 'legal name', 'name'], confidence: 0.86 },
  { kind: 'address', terms: ['address', 'street'], confidence: 0.86 },
  { kind: 'city', terms: ['city'], confidence: 0.9 },
  {
    kind: 'workAuthorization',
    terms: [
      'authorized to work',
      'work authorization',
      'work_authorization',
      'authorization',
      'work'
    ],
    confidence: 0.93
  },
  { kind: 'state', terms: ['state', 'province'], confidence: 0.9 },
  { kind: 'zip', terms: ['zip', 'postal'], confidence: 0.9 },
  { kind: 'linkedInUrl', terms: ['linkedin'], confidence: 0.94 },
  { kind: 'githubUrl', terms: ['github'], confidence: 0.94 },
  { kind: 'portfolioUrl', terms: ['portfolio', 'website'], confidence: 0.84 },
  { kind: 'resumeUpload', terms: ['resume', 'cv'], confidence: 0.91 },
  { kind: 'coverLetterUpload', terms: ['cover letter'], confidence: 0.91 },
  { kind: 'sponsorship', terms: ['sponsorship', 'visa'], confidence: 0.9 },
  {
    kind: 'desiredSalary',
    terms: ['desired salary', 'salary expectation', 'compensation'],
    confidence: 0.83
  },
  { kind: 'earliestStartDate', terms: ['start date', 'available to start'], confidence: 0.84 },
  { kind: 'currentEmployer', terms: ['current employer'], confidence: 0.86 },
  { kind: 'education', terms: ['education', 'degree', 'school'], confidence: 0.78 },
  {
    kind: 'workExperience',
    terms: ['experience', 'employment history', 'work history'],
    confidence: 0.78
  },
  {
    kind: 'voluntaryDemographic',
    terms: ['gender', 'race', 'ethnicity', 'demographic'],
    confidence: 0.9
  },
  { kind: 'disability', terms: ['disability'], confidence: 0.94 },
  { kind: 'veteranStatus', terms: ['veteran'], confidence: 0.94 }
];

export function mapFieldCandidate(candidate: FormFieldCandidate): FieldMapping {
  const primaryHaystack = normalizeKey(
    [
      candidate.labelText,
      candidate.inputType,
      candidate.ariaLabel,
      candidate.placeholder,
      candidate.name,
      candidate.id,
      candidate.autocomplete
    ]
      .filter(Boolean)
      .join(' ')
  );
  const haystack = normalizeKey(
    [primaryHaystack, candidate.nearbyText, candidate.sectionHeading].filter(Boolean).join(' ')
  );

  const matched =
    rules.find((rule) => rule.terms.some((term) => primaryHaystack.includes(term))) ??
    rules.find((rule) => rule.terms.some((term) => haystack.includes(term)));
  const kind = matched?.kind ?? 'unknown';
  const confidence = matched?.confidence ?? 0.35;
  const sensitive = isSensitiveMappingKind(kind) || isSensitiveFieldText(haystack);
  const requiresDirectReview = sensitive || (confidence >= 0.7 && confidence < 0.9);
  const manualOnly =
    candidate.inputType === 'file' || kind === 'resumeUpload' || kind === 'coverLetterUpload';
  const fillable = confidence >= 0.9 && !sensitive && candidate.visible && !manualOnly;

  return {
    candidate,
    kind,
    confidence,
    sensitive,
    fillable,
    requiresDirectReview,
    warning: buildWarning(kind, confidence, sensitive, candidate.visible, manualOnly),
    explanation: buildExplanation(kind, confidence, candidate)
  };
}

export function mapFieldCandidates(candidates: FormFieldCandidate[]): FieldMapping[] {
  return candidates.map(mapFieldCandidate);
}

function buildWarning(
  kind: FieldMappingKind,
  confidence: number,
  sensitive: boolean,
  visible: boolean,
  manualOnly: boolean
): string | undefined {
  if (!visible) return 'Field is not visible and will not be filled.';
  if (manualOnly) return 'Manual file selection required.';
  if (sensitive) return 'Sensitive field. Direct user review is required.';
  if (kind === 'unknown' || confidence < 0.7) return 'Low confidence. Do not fill automatically.';
  if (confidence < 0.9) return 'Needs direct review before filling.';
  return undefined;
}

function buildExplanation(
  kind: FieldMappingKind,
  confidence: number,
  candidate: FormFieldCandidate
): string {
  if (kind === 'unknown') return 'No strong label, attribute, or nearby-text match was found.';
  const signals = [
    candidate.labelText ? 'label' : undefined,
    candidate.ariaLabel ? 'ARIA label' : undefined,
    candidate.placeholder ? 'placeholder' : undefined,
    candidate.name ? 'name' : undefined,
    candidate.id ? 'id' : undefined,
    candidate.autocomplete ? 'autocomplete' : undefined,
    candidate.sectionHeading ? 'section heading' : undefined
  ].filter(Boolean);
  return `${kind} matched from ${signals.join(', ') || 'field context'} at ${Math.round(confidence * 100)}% confidence.`;
}
