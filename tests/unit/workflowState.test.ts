import { describe, expect, it } from 'vitest';
import {
  buildWorkflowState,
  compactWorkflowSteps,
  postActionMessage,
  profileActionLabel,
  profileHelperText,
  profileStatusLabel,
  statusTone
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
    expect(workflow.recommendedAction).toBe('Start by analyzing this job page.');
    expect(workflow.profileReady).toBe(false);
    expect(workflow.steps.find((step) => step.id === 'profile')?.status).toBe('needs-review');
    expect(profileStatusLabel(false)).toBe('Profile Needed Before Fill');
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

  it('keeps field analysis available in the message when a job exists without a profile', () => {
    const workflow = buildWorkflowState({
      pageStatus: pageReady,
      job: { id: 'job-1' } as never
    });

    expect(workflow.currentStepId).toBe('profile');
    expect(workflow.recommendedAction).toContain('You can still analyze fields now');
    expect(profileHelperText({ profileReady: false, jobReady: true, fieldsReady: false })).toBe(
      'Profile needed before fill preview. You can still analyze fields now.'
    );
  });

  it('recommends profile for suggested values after field analysis without a profile', () => {
    const workflow = buildWorkflowState({ pageStatus: pageReady, preview });

    expect(workflow.currentStepId).toBe('profile');
    expect(workflow.recommendedAction).toBe(
      'Import or create a profile to populate suggested values.'
    );
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
    expect(postActionMessage('job-analyzed', false)).toContain('You can still analyze fields now');
    expect(postActionMessage('fields-analyzed')).toContain('review suggested values');
    expect(postActionMessage('filled')).toContain('Review the page manually');
  });

  it('provides compact workflow rows and status tones', () => {
    const workflow = buildWorkflowState({ pageStatus: pageReady });
    const compact = compactWorkflowSteps(workflow.steps, workflow.currentStepId);

    expect(compact).toHaveLength(3);
    expect(compact.map((step) => step.id)).toEqual(['analyze-job', 'profile', 'analyze-fields']);
    expect(statusTone('done')).toBe('done');
    expect(statusTone('needs-review')).toBe('warning');
    expect(statusTone('blocked')).toBe('blocked');
  });
});
