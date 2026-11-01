import { describe, expect, it } from 'vitest';
import { measureJsonUtf8BytesWithinLimit } from '../../src/shared/data/BoundedJsonSize';

describe('measureJsonUtf8BytesWithinLimit', () => {
  it('matches JSON UTF-8 size for nested values and escaped Unicode', () => {
    const value = {
      nested: ['quote " slash \\ control\n', 'résumé 🌱', '\ud800', -0, NaN, null],
      enabled: true,
      omitted: undefined
    };
    const expectedBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;

    expect(measureJsonUtf8BytesWithinLimit(value, expectedBytes)).toEqual({
      ok: true,
      bytes: expectedBytes
    });
    expect(measureJsonUtf8BytesWithinLimit(value, expectedBytes - 1)).toEqual({
      ok: false,
      reason: 'too-large'
    });
  });

  it('handles a large string against the limit without serializing the containing record', () => {
    const value = { summary: 'x'.repeat(4 * 1024 * 1024) };
    const result = measureJsonUtf8BytesWithinLimit(value, 1024);

    expect(result).toEqual({ ok: false, reason: 'too-large' });
  });

  it('rejects circular and unsupported values instead of producing a misleading size', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(measureJsonUtf8BytesWithinLimit(circular, 1024)).toEqual({
      ok: false,
      reason: 'unsupported'
    });
    expect(measureJsonUtf8BytesWithinLimit({ value: 1n }, 1024)).toEqual({
      ok: false,
      reason: 'unsupported'
    });
  });
});
