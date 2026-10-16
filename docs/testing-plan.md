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
- Transactional backup snapshots and atomic multi-store local cleanup with failure-injection rollback
- New resume imports must fail on existing profile or resume IDs rather than overwriting, with atomic rollback of the other record
- Concurrent job analyses must deduplicate under one IndexedDB write lock; duplicate imported session URLs must resolve to the most recent history
- Background worker rejection and malformed-response tests must fail closed, redact internal errors, and never retry fill or persistence automatically
- Saved history UI must display valid local jobs and sessions, support text filters and pagination, and never open a page without a direct user action
- Local wording suggestions must show in both assistant surfaces, and only supported wording may be copied; unsupported claims and missing skills remain warnings
- Manual submission status requires explicit confirmation and matching live target-page URL. Cancelled or stale attempts must leave the saved session unchanged
- Content-script session persistence must be bound to the exact sender tab URL, rejecting cross-page and changed-target writes without altering stored history
- Verify fill responses have a matching page, valid challenge status, bounded result structure, and only approved selectors. Invalid responses must not be reported as successful and must never cause automatic fill retries.
- Any failed fill response must invalidate the side panel's interactive preview, require a fresh analysis and approval, and warn that some page fields may already have changed.
- In-page completion controls must update only an already saved application session; a status-only request must not invent an empty submitted or skipped session or erase fill evidence
- Verify safe local wording suggestions are shown only for saved profile skills, missing skills are warned about, and copying never fills a field or sends data to an AI provider
- Export size enforcement against the 5 MB import boundary; oversized files must never be downloaded as restorable backups
- Inject snapshot or download creation failure: Options must show a failure and must not claim a backup exists or change stored records
- Version-two seven-store export round-trip validation (including required collection presence and duplicate IDs), legacy version-one four-store compatibility, and additive restore with schema completeness, unsupported-field rejection, collision rejection (including later collections), competing imports, commit-time revalidation, and simulated write-failure rollback
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
- Opening the popup and the in-page assistant.
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
7. Without clicking **Allow This Site**, click **Open Assistant On This Page** from the popup.
8. Confirm it either analyzes successfully or gives a specific host-access-denied message.
9. If host-access-denied appears, click **Allow This Site**.
10. Retry analysis.
11. Open the in-page assistant.
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
11. Open the in-page assistant.
12. Run **Analyze Job** from the in-page assistant.
13. Run **Analyze Fields** from the in-page assistant.
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
11. Click **Open Assistant On This Page**.
12. Confirm the in-page assistant opens on the current page.
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

## Local Validation And Hosted CI Availability

Run `npm ci` and `npm run validate:local` at the exact candidate HEAD. The command runs typecheck, tests, lint, formatting, build, and build-output checks and stops on failure. Capture the exit code, commit SHA, and test summary. Do not claim these checks pass until they actually execute.

GitHub Actions previously ran the same checks, but is currently unavailable because of billing. It is not an active acceptance authority. Browser extension acceptance still needs actual unpacked Chromium runtime testing with isolated fake data, and must not be inferred from a successful local Node build.

## Future Browser Automation

Browser automation may be useful later for controlled extension QA. It should not be used to automate real job applications or bypass site protections.

## Workflow Integrity QA

1. Analyze a form with more than twelve fields and confirm every detected field is visible.
2. Approve a value, edit it, and confirm its approval is cleared.
3. Navigate to another application route and confirm stale approvals cannot fill the new page.
4. Confirm disabled, hidden, sensitive, changed, and unfillable fields remain unchanged.
5. Confirm a partial or failed fill is not reported as complete.
6. Confirm a page with no fields does not create an empty application session.
7. Confirm clearing profiles preserves unrelated settings.
8. Confirm clearing all local data also clears the remembered target page.
9. Inject a failure in a later IndexedDB clear and verify earlier clears roll back, browser settings and remembered target remain unchanged, and the UI reports a failure.
10. Inject a Chrome settings or target-page cleanup failure after a database clear and verify the UI reports partial cleanup rather than success.
9. Open the full assistant against a remembered target that has not loaded the content script and confirm the target is checked by id rather than compared with the assistant tab.

## Target And Data Boundary QA

1. Analyze a form, navigate to a different URL with matching selectors, and confirm filling is refused.
2. Open the full assistant tab from a remembered target and confirm readiness is checked against that target tab.
3. Confirm malformed fill payloads and duplicate selectors are rejected without changing the page.
4. Confirm hidden or inert ancestors, disabled fieldsets, disabled options, and disabled option groups remain unchanged.
5. Confirm same-name choice groups in separate forms are detected and filled independently.
6. Confirm checkbox groups exactly match the approved set instead of leaving old selections checked.
7. Confirm stale successful fill results cannot mark a newly approved preview complete.
8. Confirm oversized pasted resumes, `.docx` files, and JSON imports are rejected locally.
9. Confirm malformed imported profiles, jobs, searches, and sessions do not receive a valid preview.
10. Confirm target-bound page state is cleared when the target changes or becomes unavailable.

## Persistence Boundary Regression Checks

- Confirm opening a saved session does not erase its stored fill-result history.
- Confirm malformed preview status values and duplicate result selectors are rejected.
- Confirm forms above the supported field limit are capped with a visible warning.
- Confirm rapid in-page edits are serialized and save failures remain visible.
- Confirm saved-search URLs reject embedded credentials and remove fragments and common tracking parameters.
- Confirm repository documentation names are displayed without broken extension links.

## Session Lifecycle And Import Regression Checks

- Confirm restored session fields remain read-only until the current form is analyzed again.
- Confirm saving notes on a restored session preserves prior field previews and fill results.
- Confirm queued in-page writes capture immutable request snapshots and remain serialized after close and reopen.
- Confirm a completed or partial fill clears active approvals and cannot be repeated without fresh analysis.
- Confirm Mark Submitted requires direct user confirmation and session URL still matches the current page; status changes on a stale target must be refused.
- Confirm importing another fake resume preserves the original active profile as a separate record.
- Confirm Open Search opens the canonical saved-search URL without logging a completed review; Mark Reviewed records the manual review only on explicit user action, and errors do not falsely report success.
- Confirm credential-bearing page URLs and noncanonical saved-search imports are rejected.
- Confirm malformed profile structures, unsupported job enums, unknown record properties, unbound result selectors, mismatched fill-result states, and inconsistent job references fail validation.
- Confirm invalid stored records are hidden from runtime surfaces and block local-data export.
- Confirm completed and partial fill history cannot be reused without a fresh field analysis.

## Additive Backup Restore QA

1. Export fake profiles, searches, jobs, sessions, saved resume text, field mappings, and tailoring suggestions from Options.
2. In a fresh isolated browser profile, preview and confirm counts for all seven collections. Repeat with a legacy four-collection backup.
3. Verify invalid or oversized files cannot enable the restore action.
4. Cancel the confirmation and verify local data is unchanged.
5. Confirm restore, restart the extension, and verify all seven exported collections are present and exact.
6. Confirm local settings and active profile selection have not changed.
7. Choose an imported saved profile explicitly, verify it becomes active, and restart to verify persistence.
8. Start a new profile and confirm saving it cannot replace an unselected imported profile.
9. Repeat the same restore and verify duplicate IDs cancel every write without overwrites.
10. Inject a database write failure and verify all inserted records roll back.
11. Confirm restored fill approvals require fresh form analysis before re-use.
12. Confirm no form submission, external request, or unrelated storage deletion occurred.
