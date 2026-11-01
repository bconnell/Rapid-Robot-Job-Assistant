import { describe, expect, it, vi } from 'vitest';
import { extractJobPostingFromDocument } from '../../src/content/jobPageExtractor';

describe('job page extraction resource limits', () => {
  it('extracts company names from a plain company class', () => {
    document.body.innerHTML = `
      <h1 class="job-title">Frontend Engineer</h1>
      <div class="company">Example Robotics</div>
      <section class="job-description">${'Build TypeScript interfaces. '.repeat(8)}</section>`;

    const job = extractJobPostingFromDocument(document);

    expect(job.title).toBe('Frontend Engineer');
    expect(job.company).toBe('Example Robotics');
  });

  it('bounds candidate text extraction without cloning page subtrees', () => {
    document.body.innerHTML = Array.from(
      { length: 50 },
      (_, index) =>
        `<article>Role ${index}. ${'Synthetic job description content. '.repeat(400)}</article>`
    ).join('');
    const cloneNode = vi.spyOn(HTMLElement.prototype, 'cloneNode');
    const querySelectorAll = vi.spyOn(Document.prototype, 'querySelectorAll');

    try {
      const job = extractJobPostingFromDocument(document);

      expect(job.descriptionText.length).toBeLessThanOrEqual(12_000);
      expect(job.descriptionText).toContain('Role 0');
      expect(cloneNode).not.toHaveBeenCalled();
      expect(querySelectorAll).not.toHaveBeenCalled();
    } finally {
      cloneNode.mockRestore();
      querySelectorAll.mockRestore();
    }
  });

  it('caps selector traversal on a large page with no matching job metadata', () => {
    document.body.innerHTML = '<div></div>'.repeat(20_000);
    const matches = vi.spyOn(Element.prototype, 'matches');

    try {
      extractJobPostingFromDocument(document);

      expect(matches.mock.calls.length).toBeLessThan(250_000);
    } finally {
      matches.mockRestore();
    }
  });
});
