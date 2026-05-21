export interface RedactionResult {
  text: string;
  redactions: string[];
}

export function redactSensitiveText(text: string): RedactionResult {
  const redactions: string[] = [];
  let result = text;

  result = result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, () => {
    redactions.push('email');
    return '[redacted email]';
  });
  result = result.replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, () => {
    redactions.push('phone');
    return '[redacted phone]';
  });
  result = result.replace(/\b\d{3}-\d{2}-\d{4}\b/g, () => {
    redactions.push('ssn-like pattern');
    return '[redacted sensitive id]';
  });

  return { text: result, redactions: [...new Set(redactions)] };
}
