import type { FormFieldCandidate } from './FormFieldCandidate';

export type FieldMappingKind =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'linkedInUrl'
  | 'githubUrl'
  | 'portfolioUrl'
  | 'resumeUpload'
  | 'coverLetterUpload'
  | 'workAuthorization'
  | 'sponsorship'
  | 'desiredSalary'
  | 'earliestStartDate'
  | 'currentEmployer'
  | 'education'
  | 'workExperience'
  | 'yearsExperience'
  | 'highestDegree'
  | 'availability'
  | 'willingToRelocate'
  | 'remotePreference'
  | 'voluntaryDemographic'
  | 'disability'
  | 'veteranStatus'
  | 'gender'
  | 'race'
  | 'ethnicity'
  | 'pronouns'
  | 'unknown';

export interface FieldMapping {
  candidate: FormFieldCandidate;
  kind: FieldMappingKind;
  confidence: number;
  sensitive: boolean;
  fillable: boolean;
  requiresDirectReview: boolean;
  warning?: string;
  explanation?: string;
}

export interface FillPreviewItem extends FieldMapping {
  value?: string;
  approved: boolean;
  rejected?: boolean;
  status?: 'pending' | 'approved' | 'rejected' | 'filled' | 'failed' | 'manual-only';
}

export interface FillResult {
  selector: string;
  ok: boolean;
  message: string;
}
