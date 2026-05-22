export interface SavedSearch {
  id: string;
  label: string;
  url: string;
  keywords?: string[];
  location?: string;
  remoteOnly?: boolean;
  createdAt: string;
  updatedAt?: string;
  lastCheckedAt?: string;
  lastCheckStatus?: string;
  enabled: boolean;
}
