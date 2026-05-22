import { err, ok, type Result } from '../utils/Result';
import { normalizeResumeText } from './ResumeTextExtractor';

export async function extractTextFromDocx(file: File): Promise<Result<string>> {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return err('Only .docx files are supported by this parser.');
  }

  try {
    const mammoth = await import('mammoth/mammoth.browser');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = normalizeResumeText(result.value);
    if (!text) {
      return err('No text could be extracted from the .docx file.');
    }
    return ok(text);
  } catch {
    return err('The .docx file could not be parsed in this browser context.');
  }
}
