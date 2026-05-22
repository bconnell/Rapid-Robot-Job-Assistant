# Testing Plan

## Unit Tests

Batch 1 includes unit tests for:

- Resume section parsing
- Redaction
- Sensitive field rules
- Field mapping
- CAPTCHA detection
- Job dedupe
- Profile value resolution
- Fill approval defaults
- Local export/import validation
- Saved search creation and manual check status
- Typed IndexedDB repositories

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
- Importing a fake `.docx` resume.
- Reviewing and editing a profile.
- Saving a job and application session.
- Editing fill values and filling approved fields only.
- Confirming no submit buttons are clicked.
- Confirming exported JSON is not committed.

## Manual QA Checklist

1. Build extension.
2. Load `dist` folder unpacked in Chrome.
3. Open Options.
4. Import fake pasted resume.
5. Import fake `.docx` resume.
6. Review and edit profile.
7. Save profile.
8. Open fake or real job page.
9. Analyze job page.
10. Confirm job saved locally.
11. Open fake application form fixture or test page.
12. Analyze fields.
13. Confirm sensitive fields are not auto-approved.
14. Edit fill values.
15. Approve safe fields.
16. Fill approved fields.
17. Confirm no submit buttons are clicked.
18. Confirm CAPTCHA/bot-check blocks filling.
19. Save notes.
20. Clear local data.
21. Confirm no private files appear in git status.

## CI

GitHub Actions runs `npm ci`, build, tests, typecheck, lint, and format. It does not deploy or publish anything.

## Future Browser Automation

Browser automation may be useful later for controlled extension QA. It should not be used to automate real job applications or bypass site protections.
