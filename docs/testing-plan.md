# Testing Plan

## Unit Tests

Current unit and regression coverage includes:

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
- Content script readiness checks, PING messaging, content-message failure classification, tab-change detection, and standalone content-script build validation
- Guided workflow state, profile-ready labels, assistant fallback behavior, and target-page tracking guards
- Assistant open fallback, target-page expiration, and compact workflow helper behavior
- Browser compatibility detection for Chrome, Brave, Edge, Chromium, and unknown browsers
- In-page assistant open, restore, minimize, close, safety copy, and no-duplicate behavior
- Workflow simulation coverage for partial failure states

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

## Content Script Runtime QA

1. Run `npm run build`.
2. Confirm `dist/content/pageAnalyzer.js` exists.
3. Confirm `dist/content/pageAnalyzer.js` does not contain top-level import statements.
4. Confirm `dist/content/pageAnalyzer.js` does not reference `../assets`.
5. Reload the unpacked extension from `dist`.
6. Open a normal public job page.
7. Click **Analyze Current Job Page** from the popup.
8. Confirm job analysis completes or returns a specific non-generic error.
9. Click **Analyze Application Fields** from the popup on an application page.
10. Confirm field analysis completes or returns a specific non-generic error.
11. Open the side panel.
12. Repeat **Analyze Job Page**.
13. Repeat **Analyze Fields**.
14. Confirm restricted pages still show a blocked-page message.
15. Confirm no empty job or application session is saved after failed content startup.
16. Confirm no submit button is clicked.
17. Confirm no CAPTCHA or bot-check is bypassed.
18. Confirm no private files appear in git status.

## Guided Workflow QA

1. Run `npm run build`.
2. Reload the unpacked extension from `dist`.
3. Open a normal job page.
4. Open the popup.
5. Confirm only one **Open Assistant** action is visible.
6. Confirm the profile chip says **Profile Needed Before Fill** if no profile exists.
7. Confirm the profile helper text is not duplicated.
8. Confirm **Allow This Site** is visible near the top when available.
9. Confirm the primary action is visible without scrolling.
10. Confirm the popup explains the flow in one compact line.
11. Click **Open Assistant**.
12. If the side panel fails, confirm the full assistant tab opens automatically.
13. Confirm the assistant remembers the original job page.
14. Confirm the assistant does not analyze itself.
15. Analyze a job.
16. Confirm the next message says profile is needed before filling but fields can still be analyzed.
17. Analyze fields.
18. Confirm the next step tells the user to review values or import a profile if no profile exists.
19. Approve safe fields.
20. Fill approved fields.
21. Confirm the final message says to review and submit manually.
22. Confirm no submit, next, CAPTCHA, login, or apply buttons are clicked.
23. Confirm no private files appear in git status.

## In-Page Assistant QA

1. Run `npm run build`.
2. Reload the unpacked extension from `dist`.
3. Close stale assistant tabs.
4. Open a normal job page.
5. Open the popup.
6. Confirm the primary action says **Open Assistant On This Page**.
7. Click **Open Assistant On This Page**.
8. Confirm the floating in-page assistant appears on the job page.
9. Confirm it has close and minimize controls.
10. Confirm it does not cover the whole page.
11. Confirm it does not show an irrelevant non-web-page warning.
12. Analyze Job.
13. Confirm the next step is clear.
14. Open or scroll to the application form.
15. Analyze Fields.
16. Confirm field summary appears.
17. Confirm profile missing only blocks fill-related steps.
18. Import or review profile if needed.
19. Approve safe fields.
20. Fill approved fields.
21. Confirm no submit, next, login, CAPTCHA, apply, or bot-check controls are clicked.
22. Confirm no private files appear in git status.

## Browser Compatibility QA

1. Test Chrome as the primary target.
2. If Brave is available, test with Shields in their normal state.
3. Confirm Brave guidance appears only when fields, iframes, or form content are missing.
4. Confirm the extension never suggests bypassing Shields, CAPTCHA, or bot checks.
5. If Edge or another Chromium browser is available, confirm the in-page assistant works without relying on side panel support.
6. Confirm the full assistant tab explains that live work is best from the job or application page.

## Public Repo Wording QA

1. Search current content for public-facing development-tool or transcript-style wording.
2. Confirm current docs do not contain internal process wording.
3. Confirm commit messages are professional and product-focused.
4. Confirm AI is discussed only as an optional product feature.

## Guided Workflow Target QA

1. Open the popup on `https://jobs.example.com/open-jobs/software-engineer` or another safe test page.
2. Click **Open Assistant**.
3. Confirm the assistant target chip shows the original job page host.
4. Open the assistant tab directly without a target.
5. Confirm it says **No target page selected** and shows **Use This Page** near the top.
6. Confirm extension pages cannot become target pages.
7. Confirm stale UI copy disappears after `npm run build` and reloading `dist`.
8. Confirm target-page tracking expires or clears when the original tab is gone.

## Local Data QA

1. Open Options.
2. Confirm the Privacy Controls section explains what stays local.
3. Confirm **Clear Target Page** is available.
4. Confirm saved searches, jobs/sessions, profiles, and all local data have separate cleanup controls.
5. Confirm destructive delete controls require confirmation.
6. Confirm Clear Local Data is a normal danger button, not a large red panel.

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
