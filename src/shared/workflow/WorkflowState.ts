import type { ApplicationSession } from '../models/ApplicationSession';
import type { FillPreviewItem, FillResult } from '../models/FieldMapping';
import type { JobPosting } from '../models/JobPosting';
import type { UserProfile } from '../models/UserProfile';
import type { TabCapabilityResult } from '../extension/TabPermissions';

export type WorkflowStepStatus = 'ready' | 'blocked' | 'done' | 'needs-review' | 'optional';

export interface WorkflowStep {
  id: string;
  label: string;
  status: WorkflowStepStatus;
  helperText: string;
  actionLabel?: string;
}

export interface WorkflowStateInput {
  pageStatus?: Pick<TabCapabilityResult, 'ok' | 'userMessage' | 'isRestricted'>;
  profile?: UserProfile;
  job?: JobPosting;
  preview?: FillPreviewItem[];
  fillResults?: FillResult[];
  manualVerificationRequired?: boolean;
  sessionStatus?: ApplicationSession['status'];
}

export interface WorkflowState {
  currentStepId: string;
  recommendedAction: string;
  steps: WorkflowStep[];
  profileReady: boolean;
  jobReady: boolean;
  fieldsReady: boolean;
  approvalsReady: boolean;
  fillReady: boolean;
}

export type StatusTone = 'done' | 'warning' | 'blocked';

export function buildWorkflowState(input: WorkflowStateInput): WorkflowState {
  const profileReady = Boolean(input.profile);
  const jobReady = Boolean(input.job);
  const preview = input.preview ?? [];
  const fillResults = input.fillResults ?? [];
  const fieldsReady = preview.length > 0;
  const approvedItems = preview.filter((item) => item.approved);
  const approvalsReady = approvedItems.length > 0;
  const fillAttempted = fillResults.length > 0;
  const successfulSelectors = new Set(
    fillResults.filter((result) => result.ok).map((result) => result.selector)
  );
  const fillReady =
    approvalsReady &&
    approvedItems.every((item) => successfulSelectors.has(item.candidate.selector));
  const pageReady = Boolean(input.pageStatus?.ok);
  const blockedPage = Boolean(input.pageStatus && !input.pageStatus.ok);
  const finished = input.sessionStatus === 'submitted-by-user' || input.sessionStatus === 'skipped';

  const steps: WorkflowStep[] = [
    {
      id: 'analyze-job',
      label: 'Analyze job',
      status: jobReady ? 'done' : pageReady ? 'ready' : 'blocked',
      helperText: jobReady
        ? 'Job details are saved locally.'
        : blockedPage
          ? 'Open a normal job page before analyzing.'
          : 'Start by analyzing the current job page.',
      actionLabel: jobReady ? undefined : 'Analyze job page'
    },
    {
      id: 'profile',
      label: 'Profile',
      status: profileReady ? 'done' : 'needs-review',
      helperText: profileReady
        ? 'Profile ready. Review it any time before filling.'
        : 'Needed before fill preview and filling.',
      actionLabel: profileReady ? 'Review profile' : 'Import or create profile'
    },
    {
      id: 'analyze-fields',
      label: 'Analyze fields',
      status: fieldsReady ? 'done' : pageReady ? 'ready' : 'blocked',
      helperText: fieldsReady
        ? 'Application fields were analyzed.'
        : pageReady
          ? 'Analyze the application fields when the form is open.'
          : 'Open a normal application page before field analysis.',
      actionLabel: fieldsReady ? undefined : 'Analyze fields'
    },
    {
      id: 'review',
      label: 'Review values',
      status: fieldsReady
        ? fillAttempted && !fillReady
          ? 'needs-review'
          : approvalsReady
            ? 'done'
            : 'needs-review'
        : 'blocked',
      helperText:
        fillAttempted && !fillReady
          ? 'One or more approved fields failed. Review and analyze again before retrying.'
          : approvalsReady
            ? 'Approved fields are ready for a final check.'
            : fieldsReady
              ? 'Review suggested values and approve only safe fields.'
              : 'Analyze fields before reviewing fill values.',
      actionLabel: fieldsReady ? 'Review fill preview' : undefined
    },
    {
      id: 'fill',
      label: 'Fill approved',
      status: fillReady
        ? 'done'
        : fillAttempted
          ? 'needs-review'
          : approvalsReady
            ? 'ready'
            : 'blocked',
      helperText: fillReady
        ? 'Every approved field was filled. Review the page manually.'
        : fillAttempted
          ? 'The fill attempt was incomplete. Review failures before trying again.'
          : approvalsReady
            ? 'Fill only the fields you approved.'
            : 'Approve at least one safe field before filling.',
      actionLabel: fillReady ? undefined : 'Fill approved fields'
    },
    {
      id: 'finish',
      label: 'Finish manually',
      status: finished ? 'done' : fillReady ? 'needs-review' : 'optional',
      helperText:
        input.sessionStatus === 'submitted-by-user'
          ? 'Marked as submitted by you.'
          : input.sessionStatus === 'skipped'
            ? 'Marked as skipped.'
            : fillReady
              ? 'Review the completed page and submit it manually.'
              : 'You handle login, CAPTCHA, final review, and submission.',
      actionLabel: 'Mark submitted or skipped'
    }
  ];

  const currentStepId = finished
    ? 'finish'
    : fillReady
      ? 'finish'
      : fillAttempted
        ? 'review'
        : approvalsReady
          ? 'fill'
          : fieldsReady
            ? profileReady
              ? 'review'
              : 'profile'
            : !jobReady
              ? 'analyze-job'
              : !profileReady
                ? 'profile'
                : 'analyze-fields';
  const currentStep = steps.find((step) => step.id === currentStepId) ?? steps[0];

  return {
    currentStepId,
    recommendedAction: buildRecommendedAction(input, currentStep, fillAttempted, fillReady),
    steps,
    profileReady,
    jobReady,
    fieldsReady,
    approvalsReady,
    fillReady
  };
}

export function profileActionLabel(profileReady: boolean): string {
  return profileReady ? 'Review profile' : 'Import or create profile';
}

export function profileStatusLabel(profileReady: boolean): string {
  return profileReady ? 'Profile Ready' : 'Profile Needed Before Fill';
}

export function profileHelperText(input: {
  profileReady: boolean;
  jobReady: boolean;
  fieldsReady: boolean;
}): string {
  if (input.profileReady) return 'Profile ready. Review it before filling if anything changed.';
  if (input.fieldsReady) return 'Import or create a profile to populate suggested values.';
  if (input.jobReady)
    return 'Profile needed before fill preview. You can still analyze fields now.';
  return 'A saved profile is only needed before filling applications.';
}

export function compactWorkflowSteps(steps: WorkflowStep[], currentStepId: string): WorkflowStep[] {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId)
  );
  return steps.slice(currentIndex, currentIndex + 3);
}

export function statusTone(status: WorkflowStepStatus): StatusTone {
  if (status === 'done') return 'done';
  if (status === 'blocked') return 'blocked';
  return 'warning';
}

export function postActionMessage(
  action:
    | 'job-analyzed'
    | 'profile-ready'
    | 'fields-analyzed'
    | 'safe-approved'
    | 'filled'
    | 'side-panel-failed',
  profileReady = false
): string {
  if (action === 'job-analyzed') {
    return profileReady
      ? 'Job analyzed and saved. Next: analyze the application fields.'
      : 'Job analyzed and saved. Profile is needed before filling. You can still analyze fields now.';
  }
  if (action === 'profile-ready') return 'Profile ready. Next: analyze the application fields.';
  if (action === 'fields-analyzed') {
    return 'Fields analyzed. Next: review suggested values, approve safe fields, then fill approved fields.';
  }
  if (action === 'safe-approved') {
    return 'Safe fields approved. Next: review the values, then fill approved fields.';
  }
  if (action === 'filled')
    return 'Every approved field was filled. Review the page manually before submitting.';
  return 'Assistant panel could not open. The full assistant can open in a tab.';
}

function buildRecommendedAction(
  input: WorkflowStateInput,
  currentStep: WorkflowStep,
  fillAttempted: boolean,
  fillReady: boolean
): string {
  if (input.manualVerificationRequired) {
    return 'Manual verification is required. Finish it yourself before continuing.';
  }
  if (input.pageStatus && !input.pageStatus.ok) return input.pageStatus.userMessage;
  if (fillAttempted && !fillReady) {
    return 'Review the failed or changed fields, analyze again, and approve a fresh preview.';
  }
  const profileReady = Boolean(input.profile);
  const jobReady = Boolean(input.job);
  const fieldsReady = Boolean((input.preview ?? []).length);
  if (fieldsReady && !profileReady) {
    return 'Import or create a profile to populate suggested values.';
  }
  if (!jobReady) return 'Start by analyzing this job page.';
  if (jobReady && !profileReady && !fieldsReady) {
    return 'Job saved. Profile is needed before filling. You can still analyze fields now.';
  }
  return currentStep.helperText;
}
