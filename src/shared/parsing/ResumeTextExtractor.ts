import { err, ok, type Result } from '../utils/Result';

export function extractPlainTextFromPaste(value: string): Result<string> {
  const text = value.split(String.fromCharCode(0)).join('').trim();
  if (text.length < 20) {
    return err('Resume text is too short to parse safely.');
  }
  return ok(text);
}
