import type { FillPreviewItem, FillResult } from './FieldMapping';
import type { JobPosting } from './JobPosting';

export interface ApplicationSession {
  id: string;
  job?: JobPosting;
  jobPostingId?: string;
  pageUrl: string;
  startedAt: string;
  fieldPreview: FillPreviewItem[];
  fillResults: FillResult[];
  manualVerificationRequired: boolean;
  notes: string;
  status: 'draft' | 'manual-verification' | 'filled' | 'submitted-by-user' | 'skipped';
  submittedByUser: boolean;
  updatedAt: string;
}
