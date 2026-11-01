# Privacy Model

Rapid Robot Job Assistant is local-first.

## Stored Locally

- User profile data
- Pasted resume text
- Parsed resume sections
- Saved job postings
- Saved searches
- Application sessions
- Application notes
- Fill preview approval state
- Fill results
- Field mappings
- Tailoring suggestions
- Local settings

Settings are stored in `chrome.storage.local`. Larger structured records are stored in IndexedDB.

Saved profiles, resume-derived profile fields, saved jobs, application sessions, field preview decisions, fill results, notes, saved searches, and settings remain local until the user deletes them, clears extension data, or uninstalls the extension.

## Not Stored

- Original uploaded `.docx` file blobs
- Raw full page HTML from real job sites
- Raw real application form snapshots
- Raw CAPTCHA text, passwords, or MFA responses. The extension may store that a verification challenge was detected and local field metadata for the session.
- Console logs with private values
- API keys. This build has no provider setup or key storage.

## AI Requests

AI is disabled in this build. The provider classes are inactive scaffolding, and there is no remote AI request path. The extension does not send private profile, resume, job, application, or form data to remote AI providers.

There are no background AI calls, analytics, or telemetry requests in the current source. After the user approves filling, the target page receives the values in its form controls and its own page scripts may observe or transmit them.

## Never Sent Automatically

- Resume text
- Profile data
- Application answers
- Form values
- Page content
- Cookies
- Browser storage
- API keys
- Logs

## Site Permissions

The extension uses `activeTab` for one-off analysis from user-triggered buttons on normal web pages. This lets the extension inspect the current page only when the user asks. The manifest also declares optional HTTP and HTTPS host patterns so users can grant persistent access to a chosen site; the current UI requests only the active page's origin and does not request access to all sites.

Optional persistent site permission is a fallback for pages where Chrome blocks one-off script injection, or a convenience for smoother access. The permission request is for the current site origin only, not all sites.

Granting site permission does not submit applications, click CAPTCHA or bot checks, send data to AI, or upload profile data. Page analysis remains user-triggered and local.

## In-Page Assistant

The in-page assistant is user-triggered. It does not run automatically on page load. Its branded UI uses a closed shadow root so page scripts cannot inspect the profile-derived preview or invoke its controls. When the user approves filling, values are written into the current page's form controls, where that site's scripts can observe them. The assistant can be closed or minimized.

The in-page assistant does not send data externally, does not store raw page HTML, does not store uploaded `.docx` blobs, and does not bypass browser protections. Brave Shields and other browser privacy features are not changed by the extension.

## Target Page Tracking

When the popup or assistant sees a normal analyzable page, the extension stores a small local target-page record so assistant commands do not accidentally analyze an extension page. The assistant tab fallback also tries to remember the normal page before opening the tab. The record contains only the tab id, URL, origin pattern, and timestamp.

Target page tracking is local-only, expires after about 24 hours, and is cleared if the tab is gone or the URL changes. It does not store page text, form values, resume data, or application answers, and it does not send anything outside the browser.

## Form Analysis

Application form analysis runs locally after the user asks for it. The extension collects field metadata such as labels, input type, required status, options, visibility, and mapping confidence. That metadata may be stored only as part of local application sessions.

Sensitive fields are marked for direct review and are not bulk-approved. File uploads, custom widgets, disabled fields, read-only fields, hidden fields, and fields without stable selectors are manual-only. No application is submitted by the extension.

## Clear Data

The options page includes a clear local data control. It clears extension settings and IndexedDB records. It does not touch browser settings, OS settings, downloads, or files outside the extension storage area.

Options also includes smaller cleanup controls for the target page, saved searches, saved jobs and sessions, and saved profiles.

## Resume Import

Pasted resume text and `.docx` files are parsed in the browser. The original `.docx` file blob is not stored. Extracted text and parsed profile fields are stored locally when the user saves/imports.

Resume parsing is local and review-first. The parser normalizes text, detects sections, and guesses common fields, but the user should review profile data before using it to fill anything. Conservative fallback parsing can infer experience entries from local resume text when clear section headings are missing. No resume content is logged or sent externally. Education, experience, certification, and contact parsing can still need correction when a resume uses unusual formatting.

## Export And Import

Export reads all seven IndexedDB record collections in one consistent snapshot before validating the exported records. Cleanup of all IndexedDB stores is transactional so a failed individual store clear rolls back the entire database clear. Browser settings clearing is separate and is not part of that database transaction. Full cleanup attempts the atomic database clear first to preserve browser settings and target-page state when that operation fails. If a later browser-storage operation fails, cleanup reports partial completion rather than implying all state was cleared.

The supported record backup is limited to 16 MiB and 5,000 records per collection. The byte limit bounds file parsing and serialized payload allocation; the independent record limit also bounds object-count validation and per-record IndexedDB work, since many tiny JSON objects can consume substantially more memory and transaction work than their text size suggests. Tests exercise the exact 5,000/5,001 record boundary for import validation and export snapshots. Export reads the seven stores in one read-only transaction and stops once either bound is exceeded; its JSON is compact, and the final file size is checked before download. An oversized export is refused without modifying stored records. Import checks file size before reading it into memory. This bounded format supports large histories while keeping file parsing and snapshot allocation finite. The file is a backup of supported record collections, not a full copy of every item in extension storage. It contains saved resume text, field mappings, and tailoring suggestions as well as profiles, searches, jobs, and application sessions. It includes a fixed safe settings object for the backup schema; actual browser settings, provider configuration, and active-profile selection are excluded and are not applied by restore. The user interface identifies this scope before export and advises against deleting excluded data on the assumption that it can be restored from this file.

Export creates `rapid-robot-job-assistant-export.json`. It can contain private profile, resume-derived, job, saved search, and application session data. Do not commit exported files.

Import requires the full expected collection envelope, rejects unsupported top-level fields and provider secrets, and previews counts before a separate user confirmation. Restoration adds only new record IDs, atomically across all seven exported IndexedDB stores. Version-two backups require all seven collections. Older version-one backups containing the original four collections remain supported; a truncated new backup cannot masquerade as an older one. Collisions or write failures cancel the entire import. Settings and active profile selection are not applied. The imported resume documents, field mappings, and tailoring suggestions are validated along with the other collections before any write. Existing records remain untouched. API endpoints and keys are not imported or exported.

## Public Repo Rule

Do not commit real user data. Fixtures, examples, tests, screenshots, and docs must use fake data only.

## In-Page Assistant Persistence

Fill previews, user-edited values, approval decisions, and fill results created in the in-page assistant are stored locally as part of the application session. Raw real page HTML, uploaded `.docx` file blobs, CAPTCHA challenge text, passwords, and MFA responses are not stored by these workflows. Sessions may retain a challenge-detected flag and field metadata, but not values read from ordinary page input controls.

## Job Text And Session Minimization

Job extraction prefers job-description content and removes form controls, dialog content, navigation, and footer content before storing description text. This reduces the chance of unrelated page or application-form text entering a saved job.

Clearing all local data also clears the remembered target page. Clearing profiles does not erase unrelated extension settings.

## Target-Bound Commands And Import Limits

Fill requests carry the exact HTTP or HTTPS application URL used during field analysis. The service worker and content script recheck that URL before filling, and stale approvals are cleared when the page changes.

Pasted resume text, `.docx` files, and JSON import previews have explicit size limits. Imported records are checked by collection, identifier, URL, field-preview shape, fill-result shape, and truthful session status before they can be presented as valid.

Private log details are redacted regardless of whether a caller passes a string or an object.

## Saved Search URL Hygiene

Saved search URLs must use HTTP or HTTPS and cannot contain embedded usernames or passwords. URL fragments and common marketing parameters are removed before storage.

Until network AI providers are implemented, stored settings are normalized back to local-only mode with manual review required.

## Stored-Record Validation

Stored profiles, saved searches, jobs, sessions, resume documents, field mappings, and tailoring suggestions are validated before export. Invalid records are not silently treated as trusted runtime state. HTTP and HTTPS page URLs with embedded credentials or noncanonical forms are rejected.

Import previews reject unsupported record properties as well as canonicality failures. They require bounded structured profile records, supported job status values, fill results that belong to approved preview fields with matching completion states, and consistent embedded job references.
