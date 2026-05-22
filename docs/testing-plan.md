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
- Resume text normalization for collapsed `.docx`-style text
- Section heading aliases
- Contact extraction without email/link over-capture
- Skills categories
- Multi-role experience parsing
- Education parsing with degree, school, dates, and honors

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

## Options UI QA

1. Open Options at normal desktop width.
2. Confirm Options is centered and does not become six skinny columns.
3. Confirm cards do not stretch into huge empty panels.
4. Confirm Resume Import and Profile Review have enough width.
5. Confirm Clear Local Data is a normal danger button, not a large red panel.
6. Confirm Docs is a compact list.
7. Confirm raw resume text area has a sensible height.
8. Resize to roughly 390px, 768px, 1280px, 1920px, and an ultra-wide width.
9. Confirm the layout remains readable at each width.

## Parser QA

1. Paste fake resume text with Professional Summary, Technical Skills, Professional Experience, Education, and Certifications.
2. Confirm parser finds skills and experience.
3. Import a fake `.docx` resume.
4. Confirm email does not include LinkedIn or other adjacent labels.
5. Confirm LinkedIn and GitHub links are normalized.
6. Confirm city/state/zip are parsed when present.
7. Confirm summary is only summary, not the whole resume.
8. Confirm warnings appear only for real uncertainty.

## CI

GitHub Actions runs `npm ci`, build, tests, typecheck, lint, and format. It does not deploy or publish anything.

## Future Browser Automation

Browser automation may be useful later for controlled extension QA. It should not be used to automate real job applications or bypass site protections.
