import { describe, expect, it } from 'vitest';
import { extractJobPostingFromDocument } from '../../src/content/jobPageExtractor';
import { fillApprovedFields } from '../../src/content/formFiller';
import { getBrowserName } from '../../src/shared/extension/BrowserCompatibility';
import { isMeaningfulJobPosting } from '../../src/shared/jobs/JobPostingValidation';
import type { FillPreviewItem, FillResult } from '../../src/shared/models/FieldMapping';
import { buildWorkflowState, statusTone } from '../../src/shared/workflow/WorkflowState';

function preview(selector: string, value: string): FillPreviewItem {
  return {
    candidate: {
      selector,
      inputType: 'text',
      tagName: 'input',
      id: selector.startsWith('#') ? selector.slice(1) : undefined,
      options: [],
      required: false,
      visible: true,
      stableSelector: true
    },
    kind: 'fullName',
    confidence: 0.95,
    sensitive: false,
    fillable: true,
    requiresDirectReview: false,
    value,
    approved: true,
    status: 'approved'
  };
}

describe('recursive workflow integrity', () => {
  it('does not treat a long generic page as a meaningful job', () => {
    const job = {
      id: 'job-1',
      title: 'Careers',
      descriptionText: 'Welcome '.repeat(100),
      detectedKeywords: [],
      sourceUrl: 'https://jobs.example.com/',
      sourceSite: 'jobs.example.com',
      dateFound: '2026-07-26T00:00:00.000Z'
    };
    expect(isMeaningfulJobPosting(job)).toBe(false);
  });

  it('removes form text from stored job description and avoids substring keyword matches', () => {
    document.body.innerHTML = `
      <main>
        <h1>Office Coordinator</h1>
        <p>Manage candidate scheduling and employment records.</p>
        <p>Experience with calendars and testing procedures is preferred.</p>
        <form><label>Email <input value="private@example.test" /></label></form>
      </main>`;
    const job = extractJobPostingFromDocument(document);
    expect(job.descriptionText).not.toContain('Email');
    expect(job.detectedKeywords).toContain('testing');
    expect(job.detectedKeywords).not.toContain('api');
  });

  it('blocks a stale field identity even when the selector still resolves', () => {
    document.body.innerHTML = '<input id="name" type="email" />';
    const item = preview('#name', 'Alex Morgan');
    const [result] = fillApprovedFields([item], document);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('identity changed');
  });

  it('does not fill sensitive or unfillable items even if approved is forged', () => {
    document.body.innerHTML = '<input id="name" />';
    const sensitive = { ...preview('#name', 'Alex Morgan'), sensitive: true };
    const unfillable = { ...preview('#name', 'Alex Morgan'), fillable: false };
    expect(
      fillApprovedFields([sensitive, unfillable], document).every((result) => !result.ok)
    ).toBe(true);
  });

  it('does not select a disabled matching radio option', () => {
    document.body.innerHTML = `
      <label><input id="yes" type="radio" name="answer" value="yes" disabled /> Yes</label>
      <label><input id="no" type="radio" name="answer" value="no" /> No</label>`;
    const item = preview('input[name="answer"]', 'Yes');
    item.candidate.id = undefined;
    item.candidate.name = 'answer';
    item.candidate.inputType = 'radio';
    item.candidate.controlFamily = 'radio-group';
    const [result] = fillApprovedFields([item], document);
    expect(result.ok).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#yes')?.checked).toBe(false);
  });

  it('keeps failed fill attempts in review instead of marking the workflow finished', () => {
    const failed = [{ selector: '#name', ok: false, message: 'Failed' }] as FillResult[];
    const workflow = buildWorkflowState({
      pageStatus: { ok: true, userMessage: 'Ready', isRestricted: false },
      profile: { id: 'profile' } as never,
      preview: [preview('#name', 'Alex Morgan')],
      fillResults: failed
    });
    expect(workflow.fillReady).toBe(false);
    expect(workflow.currentStepId).toBe('review');
    expect(workflow.steps.find((step) => step.id === 'finish')?.status).not.toBe('done');
  });

  it('does not style a merely ready step as completed', () => {
    expect(statusTone('ready')).toBe('warning');
  });

  it('classifies Opera and Vivaldi as other Chromium browsers', () => {
    expect(
      getBrowserName('Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0', false, true)
    ).toBe('chromium');
    expect(
      getBrowserName('Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 Vivaldi/6.8', false, true)
    ).toBe('chromium');
  });
});
