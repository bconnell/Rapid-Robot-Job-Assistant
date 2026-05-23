import { describe, expect, it } from 'vitest';
import {
  simulateWorkflowScenario,
  type WorkflowScenario
} from '../../src/shared/workflow/WorkflowSimulation';

describe('WorkflowSimulation', () => {
  it('returns useful next actions for partial failure states', () => {
    const scenarios: WorkflowScenario[] = [
      'job-analysis-empty',
      'field-analysis-empty',
      'captcha-paused',
      'site-permission-missing',
      'content-script-not-ready',
      'assistant-tab-no-target',
      'side-panel-unavailable',
      'unknown-chromium'
    ];

    for (const scenario of scenarios) {
      const result = simulateWorkflowScenario(scenario);
      expect(result.recommendedNextAction.length).toBeGreaterThan(0);
      expect(result.safetyNote).toContain('No auto-submit');
      expect(result.status).not.toMatch(/irrelevant non-web-page/i);
    }
  });

  it('keeps profile missing from blocking job analysis', () => {
    const result = simulateWorkflowScenario('no-profile');

    expect(result.recommendedNextAction).toBe('Analyze Job');
    expect(result.blockedActions).toContain('Fill Approved');
  });

  it('keeps Brave Shields guidance within safety boundaries', () => {
    const result = simulateWorkflowScenario('brave-shields-likely');

    expect(result.status).toContain('blocked or missing');
    expect(result.safetyNote).toContain('does not change Shields settings');
    expect(`${result.status} ${result.recommendedNextAction} ${result.safetyNote}`).not.toMatch(
      /bypass|disable all|evade/i
    );
  });
});
