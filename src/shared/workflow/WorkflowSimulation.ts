export type WorkflowScenario =
  | 'popup-job-page'
  | 'in-page-assistant-open'
  | 'no-profile'
  | 'job-analysis-empty'
  | 'job-analysis-succeeded'
  | 'application-page'
  | 'field-analysis-empty'
  | 'fields-without-profile'
  | 'profile-imported'
  | 'preview-no-values'
  | 'safe-fields-approved'
  | 'fill-succeeded'
  | 'captcha-paused'
  | 'brave-shields-likely'
  | 'site-permission-missing'
  | 'content-script-not-ready'
  | 'page-changed'
  | 'assistant-tab-no-target'
  | 'assistant-tab-direct'
  | 'side-panel-unavailable'
  | 'unknown-chromium';

export interface WorkflowSimulationResult {
  scenario: WorkflowScenario;
  status: string;
  recommendedNextAction: string;
  allowedActions: string[];
  blockedActions: string[];
  safetyNote: string;
}

const safetyNote = 'No auto-submit. The user handles final review, CAPTCHA, login, and submission.';

export function simulateWorkflowScenario(scenario: WorkflowScenario): WorkflowSimulationResult {
  const base: WorkflowSimulationResult = {
    scenario,
    status: 'Ready to continue.',
    recommendedNextAction: 'Open Assistant On This Page',
    allowedActions: ['Open Assistant On This Page'],
    blockedActions: [],
    safetyNote
  };

  const scenarios: Record<WorkflowScenario, Partial<WorkflowSimulationResult>> = {
    'popup-job-page': {
      status: 'Job page ready.',
      recommendedNextAction: 'Open Assistant On This Page'
    },
    'in-page-assistant-open': {
      status: 'Assistant opened on this page.',
      recommendedNextAction: 'Analyze Job',
      allowedActions: ['Analyze Job', 'Analyze Fields', 'Review Profile']
    },
    'no-profile': {
      status: 'Profile needed before filling.',
      recommendedNextAction: 'Analyze Job',
      blockedActions: ['Fill Approved']
    },
    'job-analysis-empty': {
      status: 'No clear job details were found.',
      recommendedNextAction: 'Review the page or try another job page.'
    },
    'job-analysis-succeeded': {
      status: 'Job analyzed and saved locally.',
      recommendedNextAction: 'Analyze Fields or review profile before filling.',
      allowedActions: ['Analyze Fields', 'Review Profile']
    },
    'application-page': {
      status: 'Application page ready.',
      recommendedNextAction: 'Analyze Fields'
    },
    'field-analysis-empty': {
      status: 'No application fields were found.',
      recommendedNextAction: 'Check whether the form is embedded or not loaded.'
    },
    'fields-without-profile': {
      status: 'Fields found. Profile needed for suggested values.',
      recommendedNextAction: 'Import or review profile.',
      allowedActions: ['Review Profile', 'Analyze Fields'],
      blockedActions: ['Fill Approved']
    },
    'profile-imported': {
      status: 'Profile ready.',
      recommendedNextAction: 'Analyze Fields'
    },
    'preview-no-values': {
      status: 'Some fields have no saved profile value.',
      recommendedNextAction: 'Edit values manually or update profile.',
      blockedActions: ['Bulk approve missing values']
    },
    'safe-fields-approved': {
      status: 'Safe fields approved.',
      recommendedNextAction: 'Fill Approved'
    },
    'fill-succeeded': {
      status: 'Approved fields filled.',
      recommendedNextAction: 'Review and submit manually.'
    },
    'captcha-paused': {
      status: 'Manual verification detected.',
      recommendedNextAction: 'Complete verification yourself, then continue.',
      blockedActions: ['Fill Approved']
    },
    'brave-shields-likely': {
      status: 'Some fields may be blocked or missing.',
      recommendedNextAction: 'Check Shields for this site if fields are missing.',
      safetyNote: `${safetyNote} The extension does not change Shields settings.`
    },
    'site-permission-missing': {
      status: 'Chrome blocked page access.',
      recommendedNextAction: 'Click Allow This Site, reload, then retry.'
    },
    'content-script-not-ready': {
      status: 'Assistant could not start on this page.',
      recommendedNextAction: 'Reload the page and try again.'
    },
    'page-changed': {
      status: 'The active page changed before analysis finished.',
      recommendedNextAction: 'Open the page and retry.'
    },
    'assistant-tab-no-target': {
      status: 'Assistant tab is open without a target page.',
      recommendedNextAction:
        'Open a job or application page and choose Open Assistant On This Page.'
    },
    'assistant-tab-direct': {
      status: 'Assistant tab is open for saved data and diagnostics.',
      recommendedNextAction: 'Start live work from the job or application page.'
    },
    'side-panel-unavailable': {
      status: 'Side panel is unavailable.',
      recommendedNextAction: 'Use the in-page assistant.'
    },
    'unknown-chromium': {
      status: 'Browser support is best effort.',
      recommendedNextAction: 'Use the in-page assistant and avoid relying on side panel support.'
    }
  };

  return { ...base, ...scenarios[scenario] };
}
