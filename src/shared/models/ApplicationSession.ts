import type { FillPreviewItem, FillResult } from './FieldMapping';
import type { JobPosting } from './JobPosting';

export interface ApplicationSession {
  id: string;
  job?: JobPosting;
  pageUrl: string;
  fieldPreview: FillPreviewItem[];
  fillResults: FillResult[];
  manualVerificationRequired: boolean;
  notes: string;
  updatedAt: string;
}
