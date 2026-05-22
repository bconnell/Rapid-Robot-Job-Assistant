import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('extension HTML stylesheet links', () => {
  it('keeps all extension pages linked to the deterministic shared stylesheet', () => {
    for (const page of ['options', 'popup', 'sidepanel']) {
      const html = readFileSync(`src/${page}/${page}.html`, 'utf8');
      expect(html).toContain('../shared/styles.css');
      expect(html).toContain('./main.js');
    }
  });
});
