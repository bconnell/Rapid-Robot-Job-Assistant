import { describe, expect, it } from 'vitest';
import {
  isSensitiveFieldText,
  isSensitiveMappingKind
} from '../../src/shared/security/SensitiveFieldRules';

describe('SensitiveFieldRules', () => {
  it('flags voluntary demographic and work authorization text', () => {
    expect(isSensitiveFieldText('Voluntary self-identification of disability')).toBe(true);
    expect(isSensitiveFieldText('Are you authorized to work in the United States?')).toBe(true);
    expect(isSensitiveMappingKind('veteranStatus')).toBe(true);
  });
});
