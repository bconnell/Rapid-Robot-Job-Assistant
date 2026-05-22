import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeApplicationFields } from '../../src/content/pageAnalyzer';

function loadFixture(name: string) {
  document.body.innerHTML = readFileSync(
    resolve(`tests/fixtures/application-forms/${name}`),
    'utf8'
  );
}

describe('page analyzer form summary', () => {
  it('returns compact summary counts for application fields', () => {
    loadFixture('simple-company-form.html');

    const result = analyzeApplicationFields();

    expect(result.fieldCount).toBeGreaterThan(5);
    expect(result.fillableCount).toBeGreaterThan(3);
    expect(result.manualOnlyCount).toBeGreaterThanOrEqual(1);
    expect(result.sensitiveCount).toBe(0);
  });

  it('returns iframe warnings when application fields may be inside a frame', () => {
    loadFixture('iframe-application-shell.html');

    const result = analyzeApplicationFields();

    expect(result.fieldCount).toBe(0);
    expect(result.iframeWarnings[0]).toContain('iframe');
    expect(result.warnings[0]).toContain('iframe');
  });
});
