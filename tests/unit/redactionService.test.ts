import { describe, expect, it } from 'vitest';
import { redactSensitiveText } from '../../src/shared/ai/RedactionService';

describe('redactSensitiveText', () => {
  it('redacts common contact details', () => {
    const result = redactSensitiveText('Email alex@example.com or call 555-010-3344.');

    expect(result.text).toContain('[redacted email]');
    expect(result.text).toContain('[redacted phone]');
    expect(result.redactions).toEqual(['email', 'phone']);
  });
});
