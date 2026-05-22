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
- Build output validation for shared stylesheet links in popup, side panel, and Options
- Fake regression coverage for glued education text, school-first education text, and certification section boundaries
- Experience parser regression coverage for Additional Experience, Work History, Employment, Professional Background, fallback project blocks, freelance entries, and no-experience cases
- Active tab permission preflight, restricted URL detection, injection failure classification, and current-origin permission patterns
- Application form detection for native labels, ARIA references, fieldset legends, grouped radio/checkbox controls, select options, disabled fields, read-only fields, hidden fields, custom widgets, and iframe warnings
- Field mapping false-positive prevention, manual-only rules, sensitive direct-review rules, and page-level analysis summary counts
- Approved-only filling for React-style text inputs, native selects, radio groups, checkbox groups, and unsafe/manual-only fields

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

## Site Permission QA

1. Build extension.
2. Load `dist` folder unpacked in Chrome.
3. Open `chrome://extensions`.
4. Click Analyze.
5. Confirm the extension says Chrome blocks internal pages.
6. Open a normal job page or test page.
7. Without clicking **Allow This Site**, click Analyze Job Page from the popup.
8. Confirm it either analyzes successfully or gives a specific host-access-denied message.
9. If host-access-denied appears, click **Allow This Site**.
10. Retry analysis.
11. Open the side panel.
12. Click Analyze Job Page from the side panel.
13. Click Analyze Fields on a fake or real application page.
14. Confirm failed commands do not create empty job or session records.
15. Confirm restricted pages do not produce generic command failed messages.
16. Confirm the page remains styled.
17. Confirm no submit buttons are clicked.
18. Confirm no CAPTCHA or bot checks are bypassed.
19. Confirm local-only privacy language remains visible.
20. Deny the current-site permission request on a normal page and confirm the UI explains one-off analysis can still be tried.

## Application Form QA

1. Run `npm run build`.
2. Reload the unpacked extension from `dist`.
3. Open a fake simple application form.
4. Analyze fields.
5. Confirm summary counts match the page.
6. Confirm first name, last name, email, phone, city, state, and zip are mapped correctly.
7. Confirm resume upload is manual-only.
8. Confirm cover letter upload is manual-only.
9. Confirm work authorization and sponsorship fields require review when shown as select or radio fields.
10. Confirm voluntary demographic fields are sensitive and not bulk-approved.
11. Confirm disabled and read-only fields are not fillable.
12. Confirm custom dropdowns are manual-only.
13. Approve safe fields.
14. Fill approved fields.
15. Confirm React-style inputs update visibly.
16. Confirm select, radio, and checkbox fields fill only when matching is safe.
17. Confirm no submit button is clicked.
18. Confirm CAPTCHA or bot-check detection still pauses filling.
19. Confirm iframe warnings appear when fields may be inside an iframe.
20. Confirm no empty session is saved on failed analysis.
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
10. Confirm popup, side panel, and Options are styled when loaded from the built `dist` folder.

## Parser QA

1. Paste fake resume text with Professional Summary, Technical Skills, Professional Experience, Education, and Certifications.
2. Confirm parser finds skills and experience.
3. Import a fake `.docx` resume.
4. Confirm email does not include LinkedIn or other adjacent labels.
5. Confirm LinkedIn and GitHub links are normalized.
6. Confirm city/state/zip are parsed when present.
7. Confirm summary is only summary, not the whole resume.
8. Confirm warnings appear only for real uncertainty.
9. Confirm education entries do not duplicate school, degree, field, and date values.
10. Confirm certifications stop before Projects, Education, or other later sections.
11. Paste fake resume text with Additional Experience and confirm experience entries are found.
12. Paste fake resume text with Work History or Employment and confirm experience entries are found.
13. Paste fake resume text with Freelance Software Developer and bullets, then confirm the entry is marked for review instead of missing.
14. Confirm summary and skills text with developer-related words do not create fake experience entries.

## CI

GitHub Actions runs `npm ci`, build, tests, typecheck, lint, and format. It does not deploy or publish anything.

## Future Browser Automation

Browser automation may be useful later for controlled extension QA. It should not be used to automate real job applications or bypass site protections.
