export type BoundedJsonSizeResult =
  | { ok: true; bytes: number }
  | { ok: false; reason: 'too-large' | 'unsupported' };

/** Counts JSON UTF-8 bytes without first allocating a serialized copy of the value. */
export function measureJsonUtf8BytesWithinLimit(
  value: unknown,
  maxBytes: number
): BoundedJsonSizeResult {
  let bytes = 0;
  let failure: 'too-large' | 'unsupported' | undefined;
  const ancestors = new Set<object>();

  const add = (count: number): boolean => {
    bytes += count;
    if (bytes > maxBytes) {
      failure = 'too-large';
      return false;
    }
    return true;
  };

  const addJsonString = (text: string): boolean => {
    if (!add(2)) return false;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (
        code === 0x22 ||
        code === 0x5c ||
        code === 0x08 ||
        code === 0x0c ||
        code === 0x0a ||
        code === 0x0d ||
        code === 0x09
      ) {
        if (!add(2)) return false;
      } else if (code < 0x20 || (code >= 0xd800 && code <= 0xdfff)) {
        if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
          const next = text.charCodeAt(index + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            if (!add(4)) return false;
            index += 1;
            continue;
          }
        }
        if (!add(6)) return false;
      } else if (code < 0x80) {
        if (!add(1)) return false;
      } else if (code < 0x800) {
        if (!add(2)) return false;
      } else if (!add(3)) {
        return false;
      }
    }
    return true;
  };

  const visit = (current: unknown, inArray = false): boolean => {
    if (current === null) return add(4);
    if (current === undefined || typeof current === 'function' || typeof current === 'symbol') {
      if (inArray) return add(4);
      failure = 'unsupported';
      return false;
    }
    if (typeof current === 'string') return addJsonString(current);
    if (typeof current === 'boolean') return add(current ? 4 : 5);
    if (typeof current === 'number') {
      const jsonNumber = Number.isFinite(current)
        ? Object.is(current, -0)
          ? '0'
          : String(current)
        : 'null';
      return add(jsonNumber.length);
    }
    if (typeof current === 'bigint') {
      failure = 'unsupported';
      return false;
    }

    if (current instanceof Date) {
      const dateString = Number.isNaN(current.getTime()) ? null : current.toISOString();
      return dateString === null ? add(4) : addJsonString(dateString);
    }
    if (typeof current !== 'object') {
      failure = 'unsupported';
      return false;
    }
    if (ancestors.has(current)) {
      failure = 'unsupported';
      return false;
    }
    ancestors.add(current);

    let success = true;
    if (Array.isArray(current)) {
      success = add(1);
      for (let index = 0; success && index < current.length; index += 1) {
        if (index > 0) success = add(1);
        if (success) success = visit(current[index], true);
      }
      if (success) success = add(1);
    } else {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        failure = 'unsupported';
        success = false;
      } else {
        success = add(1);
        let first = true;
        for (const key in current as Record<string, unknown>) {
          if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
          const child = (current as Record<string, unknown>)[key];
          if (child === undefined || typeof child === 'function' || typeof child === 'symbol')
            continue;
          if (!first) success = add(1);
          if (success) success = addJsonString(key);
          if (success) success = add(1);
          if (success) success = visit(child);
          if (!success) break;
          first = false;
        }
        if (success) success = add(1);
      }
    }

    ancestors.delete(current);
    return success;
  };

  if (!visit(value)) return { ok: false, reason: failure ?? 'unsupported' };
  return { ok: true, bytes };
}
