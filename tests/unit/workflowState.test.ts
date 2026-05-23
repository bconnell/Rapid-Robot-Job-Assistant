import { describe, expect, it } from 'vitest';
import {
  buildWorkflowState,
  postActionMessage,
  profileActionLabel
} from '../../src/shared/workflow/WorkflowState';
import type { FillPreviewItem, FillResult } from '../../src/shared/models/FieldMapping';
import type { UserProfile } from '../../src/shared/models/UserProfile';

const pageReady = {
  ok: true,
  userMessage: 'The page is ready for analysis.',
  isRestricted: false
};

const profile: UserProfile = {
  id: 'profile-1',
  contact: { fullName: 'Alex Morgan', email: 'alex@example.com' },
  skills: [],
  experience: [],
  education: [],
  certifications: [],
  projects: [],
  desiredTitles: [],
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const preview = [{ approved: false } as FillPreviewItem];
const approvedPreview = [{ approved: true } as FillPreviewItem];
const fillResults = [{ selector: '#first', ok: true, message: 'Filled' } as FillResult];

describe('WorkflowState', () => {
  it('allows job analysis before a profile exists', () => {
    const workflow = buildWorkflowState({ pageStatus: pageReady });

    expect(workflow.currentStepId).toBe('analyze-job');
    expect(workflow.profileReady).toBe(false);
    expect(workflow.steps.find((step) => step.id === 'profile')?.status).toBe('needs-review');
  });

  it('uses review profile wording when a profile is ready', () => {
    const workflow = buildWorkflowState({ pageStatus: pageReady, profile });

    expect(profileActionLabel(workflow.profileReady)).toBe('Review profile');
    expect(workflow.steps.find((step) => step.id === 'profile')?.status).toBe('done');
  });

  it('recommends field analysis after a job is analyzed', () => {
    const workflow = buildWorkflowState({
      pageStatus: pageReady,
      profile,
      job: { id: 'job-1' } as never
    });

    expect(workflow.jobReady).toBe(true);
    expect(workflow.currentStepId).toBe('analyze-fields');
  });

  it('moves from field review to fill when values are approved', () => {
    expect(buildWorkflowState({ pageStatus: pageReady, profile, preview }).currentStepId).toBe(
      'review'
    );
    expect(
      buildWorkflowState({ pageStatus: pageReady, profile, preview: approvedPreview }).currentStepId
    ).toBe('fill');
  });

  it('marks fill as done after fill results exist', () => {
    const workflow = buildWorkflowState({
      pageStatus: pageReady,
      profile,
      preview: approvedPreview,
      fillResults
    });

    expect(workflow.fillReady).toBe(true);
    expect(workflow.steps.find((step) => step.id === 'fill')?.status).toBe('done');
  });

  it('uses specific post-action next-step messages', () => {
    expect(postActionMessage('job-analyzed', false)).toContain('import or create a profile');
    expect(postActionMessage('fields-analyzed')).toContain('review suggested values');
    expect(postActionMessage('filled')).toContain('Review the page manually');
  });
});
