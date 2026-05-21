export interface ResumeParseWarning {
  section: string;
  message: string;
}

export interface ResumeDocument {
  id: string;
  fileName?: string;
  sourceType: 'pasted-text' | 'docx';
  text: string;
  importedAt: string;
  warnings: ResumeParseWarning[];
}
