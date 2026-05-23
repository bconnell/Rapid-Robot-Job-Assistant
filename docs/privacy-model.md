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
- CAPTCHA, login, MFA, or bot-check details
- Console logs with private values
- API keys, unless a reviewed optional provider setup is added later

## AI Requests

AI is disabled by default. If a provider is configured later, the user must review what would be sent before any request leaves the browser. Redaction is applied where possible, but review is still required.

No resume data, job page text, application answers, field values, or provider requests are uploaded to AI providers by default. There are no background AI calls.

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

The extension uses `activeTab` for one-off analysis from user-triggered buttons on normal web pages. This lets the extension inspect the current page only when the user asks.

Optional persistent site permission is a fallback for pages where Chrome blocks one-off script injection, or a convenience for smoother access. The permission request is for the current site origin only, not all sites.

Granting site permission does not submit applications, click CAPTCHA or bot checks, send data to AI, or upload profile data. Page analysis remains user-triggered and stays local unless the user later reviews and approves an AI request.

## In-Page Assistant

The in-page assistant is user-triggered. It does not run automatically on page load. It creates only its own branded extension UI on the current page and can be closed or minimized.

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

Export creates `rapid-robot-job-assistant-export.json`. It can contain private profile, resume-derived, job, saved search, and application session data. Do not commit exported files.

Import validates JSON shape and shows preview counts. It does not merge records yet. API endpoints and keys are not imported or exported.

## Public Repo Rule

Do not commit real user data. Fixtures, examples, tests, screenshots, and docs must use fake data only.
