import { err, type Result } from '../utils/Result';
import { extractPlainTextFromPaste } from './ResumeTextExtractor';

const maxDocxBytes = 10 * 1024 * 1024;

export async function extractTextFromDocx(file: File): Promise<Result<string>> {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return err('Only .docx files are supported by this parser.');
  }
  if (file.size > maxDocxBytes) {
    return err('The .docx file is too large. Keep it under 10 MB.');
  }

  try {
    const mammoth = await import('mammoth/mammoth.browser');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const validated = extractPlainTextFromPaste(result.value);
    if (!validated.ok) return validated;
    return validated;
  } catch {
    return err('The .docx file could not be parsed in this browser context.');
  }
}
