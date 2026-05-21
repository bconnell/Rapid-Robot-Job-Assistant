# Testing Plan

## Unit Tests

Batch 1 includes unit tests for:

- Resume section parsing
- Redaction
- Sensitive field rules
- Field mapping
- CAPTCHA detection
- Job dedupe

## Fixtures

Fixtures are fake but realistic. They must not be copied from real resumes, real job applications, real browser sessions, or real user exports.

## Manual QA

Manual checks should cover:

- Loading `dist` as an unpacked extension.
- Opening the popup and side panel.
- Analyzing a fake or safe public job page.
- Detecting fields on a test form.
- Confirming CAPTCHA detection pauses filling.
- Clearing local data from options.

## Future Browser Automation

Browser automation may be useful later for controlled extension QA. It should not be used to automate real job applications or bypass site protections.
