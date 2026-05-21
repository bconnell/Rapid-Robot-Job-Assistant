export interface ProfileContact {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  zip?: string;
  linkedInUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
}

export interface ProfileExperience {
  employer: string;
  title: string;
  startDate?: string;
  endDate?: string;
  highlights: string[];
}

export interface ProfileEducation {
  school: string;
  degree?: string;
  field?: string;
  graduationDate?: string;
}

export interface UserProfile {
  id: string;
  contact: ProfileContact;
  summary?: string;
  skills: string[];
  experience: ProfileExperience[];
  education: ProfileEducation[];
  certifications: string[];
  workAuthorization?: string;
  sponsorshipRequired?: boolean;
  desiredSalary?: string;
  earliestStartDate?: string;
  updatedAt: string;
}

export const emptyUserProfile = (): UserProfile => ({
  id: 'default',
  contact: {},
  skills: [],
  experience: [],
  education: [],
  certifications: [],
  updatedAt: new Date().toISOString()
});
