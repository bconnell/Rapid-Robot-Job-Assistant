export interface JobPosting {
  id: string;
  title: string;
  company?: string;
  location?: string;
  salaryText?: string;
  remoteStatus?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  descriptionText: string;
  requirementsText?: string;
  preferredQualificationsText?: string;
  detectedKeywords: string[];
  sourceUrl: string;
  sourceSite: string;
  dateFound: string;
  status?: 'saved' | 'reviewing' | 'applied' | 'skipped';
  updatedAt?: string;
}
