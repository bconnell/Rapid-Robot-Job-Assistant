import type { FieldMapping, FieldMappingKind } from '../shared/models/FieldMapping';
import type { FormFieldCandidate } from '../shared/models/FormFieldCandidate';
import {
  isSensitiveFieldText,
  isSensitiveMappingKind
} from '../shared/security/SensitiveFieldRules';
import { normalizeKey } from '../shared/utils/Validation';

type SignalName =
  | 'autocomplete'
  | 'label'
  | 'aria'
  | 'name'
  | 'id'
  | 'placeholder'
  | 'nearby text'
  | 'section heading'
  | 'input type'
  | 'options';

interface Rule {
  kind: FieldMappingKind;
  phrases: string[];
  weakPhrases?: string[];
}

interface Score {
  kind: FieldMappingKind;
  score: number;
  signals: Set<SignalName>;
}

const rules: Rule[] = [
  { kind: 'firstName', phrases: ['first name', 'given name', 'forename'], weakPhrases: ['fname'] },
  { kind: 'lastName', phrases: ['last name', 'surname', 'family name'], weakPhrases: ['lname'] },
  {
    kind: 'fullName',
    phrases: ['full name', 'legal name', 'preferred name'],
    weakPhrases: ['name']
  },
  { kind: 'email', phrases: ['email address', 'e-mail address', 'email', 'e-mail'] },
  { kind: 'phone', phrases: ['phone number', 'mobile number', 'telephone', 'phone', 'mobile'] },
  { kind: 'address', phrases: ['street address', 'mailing address', 'address line', 'address'] },
  { kind: 'city', phrases: ['city'] },
  { kind: 'state', phrases: ['state/province', 'state or province', 'province', 'state'] },
  { kind: 'zip', phrases: ['zip code', 'postal code', 'postcode', 'zip'] },
  { kind: 'linkedInUrl', phrases: ['linkedin profile', 'linkedin url', 'linkedin'] },
  { kind: 'githubUrl', phrases: ['github profile', 'github url', 'github'] },
  { kind: 'portfolioUrl', phrases: ['portfolio url', 'personal website', 'website', 'portfolio'] },
  { kind: 'resumeUpload', phrases: ['resume upload', 'upload resume', 'resume', 'cv'] },
  {
    kind: 'coverLetterUpload',
    phrases: ['cover letter upload', 'upload cover letter', 'cover letter']
  },
  {
    kind: 'workAuthorization',
    phrases: [
      'authorized to work',
      'legally authorized',
      'work authorization',
      'authorized employment',
      'eligible to work'
    ]
  },
  {
    kind: 'sponsorship',
    phrases: ['visa sponsorship', 'require sponsorship', 'need sponsorship', 'sponsorship']
  },
  {
    kind: 'desiredSalary',
    phrases: ['desired salary', 'salary expectation', 'compensation expectation', 'expected pay']
  },
  {
    kind: 'earliestStartDate',
    phrases: ['earliest start date', 'available to start', 'start date', 'availability date']
  },
  { kind: 'currentEmployer', phrases: ['current employer', 'current company'] },
  { kind: 'education', phrases: ['education history', 'education', 'degree', 'school'] },
  {
    kind: 'workExperience',
    phrases: ['work experience', 'employment history', 'professional experience']
  },
  { kind: 'yearsExperience', phrases: ['years of experience', 'years experience'] },
  { kind: 'highestDegree', phrases: ['highest degree', 'highest level of education'] },
  { kind: 'availability', phrases: ['availability', 'available hours'] },
  { kind: 'willingToRelocate', phrases: ['willing to relocate', 'relocation'] },
  {
    kind: 'remotePreference',
    phrases: ['remote preference', 'work location preference', 'preferred work location']
  },
  {
    kind: 'voluntaryDemographic',
    phrases: ['voluntary demographic', 'demographic information', 'self identification']
  },
  {
    kind: 'disability',
    phrases: ['disability status', 'disability self identification', 'disability']
  },
  { kind: 'veteranStatus', phrases: ['veteran status', 'protected veteran', 'veteran'] },
  { kind: 'gender', phrases: ['gender identity', 'gender'] },
  { kind: 'race', phrases: ['race'] },
  { kind: 'ethnicity', phrases: ['ethnicity', 'hispanic', 'latino'] },
  { kind: 'pronouns', phrases: ['pronouns'] }
];

const autocompleteKinds: Record<string, FieldMappingKind> = {
  'given-name': 'firstName',
  'family-name': 'lastName',
  name: 'fullName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'street-address': 'address',
  'address-line1': 'address',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'zip',
  url: 'portfolioUrl'
};

export function mapFieldCandidate(candidate: FormFieldCandidate): FieldMapping {
  const scores = new Map<FieldMappingKind, Score>();
  const signalValues = buildSignalValues(candidate);

  const autocomplete = normalizeKey(candidate.autocomplete ?? '');
  const autocompleteKind = autocompleteKinds[autocomplete];
  if (autocompleteKind) addScore(scores, autocompleteKind, 0.55, 'autocomplete');

  if (candidate.inputType === 'email') addScore(scores, 'email', 0.35, 'input type');
  if (candidate.inputType === 'tel') addScore(scores, 'phone', 0.35, 'input type');
  if (candidate.inputType === 'url') addScore(scores, 'portfolioUrl', 0.18, 'input type');
  if (candidate.inputType === 'file') {
    const fileText = combinedText(candidate);
    addScore(
      scores,
      fileText.includes('cover') ? 'coverLetterUpload' : 'resumeUpload',
      0.6,
      'input type'
    );
  }

  for (const rule of rules) {
    applyRule(scores, rule, signalValues);
  }

  const best = [...scores.values()].sort((a, b) => b.score - a.score)[0];
  const kind = best?.score ? best.kind : 'unknown';
  const confidence = kind === 'unknown' ? 0.35 : clamp(best.score);
  const allText = combinedText(candidate);
  const sensitive = isSensitiveMappingKind(kind) || isSensitiveFieldText(allText);
  const manualOnlyReason = getManualOnlyReason(candidate, kind);
  const fillable =
    confidence >= 0.9 &&
    !sensitive &&
    !manualOnlyReason &&
    candidate.visible &&
    candidate.stableSelector !== false;
  const requiresDirectReview =
    sensitive || (confidence >= 0.7 && confidence < 0.9) || Boolean(manualOnlyReason);

  return {
    candidate,
    kind,
    confidence,
    sensitive,
    fillable,
    requiresDirectReview,
    warning: buildWarning(kind, confidence, sensitive, candidate, manualOnlyReason),
    explanation: buildExplanation(kind, confidence, best?.signals ?? new Set())
  };
}

export function mapFieldCandidates(candidates: FormFieldCandidate[]): FieldMapping[] {
  return candidates.map(mapFieldCandidate);
}

function buildSignalValues(
  candidate: FormFieldCandidate
): Array<{ name: SignalName; text: string; weight: number }> {
  return [
    { name: 'autocomplete', text: candidate.autocomplete ?? '', weight: 0.55 },
    {
      name: 'label',
      text: [candidate.labelText, candidate.groupLabel, candidate.fieldsetLegend]
        .filter(Boolean)
        .join(' '),
      weight: 0.44
    },
    {
      name: 'aria',
      text: [candidate.ariaLabel, candidate.ariaLabelledBy, candidate.ariaDescribedBy]
        .filter(Boolean)
        .join(' '),
      weight: 0.42
    },
    { name: 'name', text: candidate.name ?? '', weight: 0.28 },
    { name: 'id', text: candidate.id ?? '', weight: 0.26 },
    { name: 'placeholder', text: candidate.placeholder ?? '', weight: 0.22 },
    {
      name: 'options',
      text: [...candidate.options, ...(candidate.optionValues ?? [])].join(' '),
      weight: 0.2
    },
    { name: 'nearby text', text: candidate.nearbyText ?? '', weight: 0.14 },
    { name: 'section heading', text: candidate.sectionHeading ?? '', weight: 0.08 }
  ];
}

function applyRule(
  scores: Map<FieldMappingKind, Score>,
  rule: Rule,
  signalValues: Array<{ name: SignalName; text: string; weight: number }>
): void {
  for (const signal of signalValues) {
    const text = normalizeKey(signal.text);
    if (!text) continue;
    for (const phrase of rule.phrases) {
      if (matchesPhrase(text, phrase)) {
        addScore(scores, rule.kind, signal.weight + (text === phrase ? 0.18 : 0), signal.name);
      }
    }
    for (const phrase of rule.weakPhrases ?? []) {
      if (matchesPhrase(text, phrase))
        addScore(scores, rule.kind, signal.weight * 0.65, signal.name);
    }
  }
}

function matchesPhrase(text: string, phrase: string): boolean {
  const normalized = normalizeKey(phrase);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

function addScore(
  scores: Map<FieldMappingKind, Score>,
  kind: FieldMappingKind,
  score: number,
  signal: SignalName
): void {
  const current = scores.get(kind) ?? { kind, score: 0, signals: new Set<SignalName>() };
  current.score += score;
  current.signals.add(signal);
  scores.set(kind, current);
}

function buildWarning(
  kind: FieldMappingKind,
  confidence: number,
  sensitive: boolean,
  candidate: FormFieldCandidate,
  manualOnlyReason?: string
): string | undefined {
  if (!candidate.visible) return 'Field is hidden and will not be filled.';
  if (candidate.disabled) return 'Field is disabled and will not be filled.';
  if (candidate.readOnly) return 'Field is read-only and will not be filled.';
  if (candidate.stableSelector === false)
    return 'Field needs manual review because a stable selector was not found.';
  if (manualOnlyReason) return manualOnlyReason;
  if (sensitive) return 'Sensitive field. Direct user review is required.';
  if (kind === 'unknown' || confidence < 0.7)
    return 'Low confidence. Skip unless you review it directly.';
  if (confidence < 0.9) return 'Needs direct review before filling.';
  return undefined;
}

function buildExplanation(
  kind: FieldMappingKind,
  confidence: number,
  signals: Set<SignalName>
): string {
  if (kind === 'unknown') return 'No strong label, attribute, or nearby-text match was found.';
  const signalList = [...signals].join(', ') || 'field context';
  const confidenceText =
    confidence >= 0.9 ? 'High confidence' : confidence >= 0.7 ? 'Review needed' : 'Low confidence';
  return `${confidenceText}: matched ${kind} from ${signalList}.`;
}

function getManualOnlyReason(
  candidate: FormFieldCandidate,
  kind: FieldMappingKind
): string | undefined {
  if (candidate.inputType === 'file' || kind === 'resumeUpload' || kind === 'coverLetterUpload') {
    return 'File upload detected. Select the file manually.';
  }
  if (candidate.controlFamily === 'aria-combobox' || candidate.controlFamily === 'custom-select') {
    return 'Custom dropdown detected. Review and fill manually.';
  }
  if (candidate.controlFamily === 'unknown-widget' || candidate.candidateSource === 'aria-widget') {
    return 'Custom field detected. Review and fill manually.';
  }
  return undefined;
}

function combinedText(candidate: FormFieldCandidate): string {
  return normalizeKey(
    [
      candidate.labelText,
      candidate.groupLabel,
      candidate.fieldsetLegend,
      candidate.inputType,
      candidate.ariaLabel,
      candidate.ariaLabelledBy,
      candidate.ariaDescribedBy,
      candidate.placeholder,
      candidate.name,
      candidate.id,
      candidate.autocomplete,
      candidate.nearbyText,
      candidate.sectionHeading,
      ...candidate.options,
      ...(candidate.optionValues ?? [])
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function clamp(value: number): number {
  return Math.max(0.35, Math.min(0.98, value));
}
