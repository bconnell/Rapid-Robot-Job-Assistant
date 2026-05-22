# Rapid Robot Job Assistant

Rapid Robot Job Assistant is a local-first Chrome extension for organizing job searches, reviewing job pages, comparing postings against a user profile, and preparing reviewed form-fill suggestions.

It is built around user control. The extension can analyze the current page when asked, draft truthful wording from user-provided information, detect application fields, and fill only fields the user approves. The user handles login, CAPTCHA, MFA, final review, and submission.

## What This Is Not

This is not a mass application bot. It does not auto-submit applications, bypass CAPTCHA, evade bot detection, spoof fingerprints, fake user behavior, or invent qualifications.

## Update History

Newest changes are listed first.

### 2026-05-22. Experience Parsing Reliability Fix

- Added more experience section aliases, including Additional Experience, Work History, Employment, and Professional Background.
- Improved `.docx` heading splitting for Additional Experience and related headings.
- Added conservative fallback parsing for experience-like resume blocks.
- Improved review warnings so inferred experience is flagged for review instead of reported as missing.
- No change to local-first privacy, no auto-submit, or manual review rules.

### 2026-05-22. Active Tab Analysis And Permission Flow Correction

- One-off analysis now uses `activeTab` on normal web pages before asking for persistent site permission.
- Current-site permission is a fallback or convenience, not a hard requirement.
- Permission requests stay current-origin only, such as `https://example.com/*`.
- Restricted browser pages remain blocked with clear messages.
- Failed analysis does not save empty jobs or application sessions.
- No change to local-first privacy, no auto-submit, or manual review rules.

### 2026-05-22. Site Permission And Command Reliability Fixes

- Added clearer page checks before job analysis, field analysis, and approved filling.
- Added a current-site permission request flow instead of relying on broad default host access.
- Improved messages for restricted browser pages, missing site permission, and injection failures.
- Prevented failed analysis commands from saving empty job or application session records.
- No change to local-first privacy, no auto-submit, or manual review rules.

### 2026-05-22. Browser QA Styling And Parser Fixes

- Made shared styles load deterministically from the built Chrome extension output.
- Added build-output validation so popup, side panel, and Options keep their stylesheet links.
- Tightened Options layout rules for centered desktop use, small screens, and wide monitors.
- Fixed education parsing cases where degree, field, school, and dates could duplicate or glue together.
- Improved experience and certification parsing regression coverage with fake resume data.
- No change to local-first privacy, no auto-submit, or manual review rules.

### 2026-05-22. Options UI And Resume Parsing Hardening

- Cleaned up the Options layout so wide screens use a centered main column and sidebar instead of many skinny columns.
- Added better `.docx` text normalization for glued labels and headings.
- Improved resume section detection for common heading aliases.
- Improved contact, skills, experience, and education parsing.
- Added a compact parsing summary so users can see what was found and what needs review.
- No change to local-first privacy, no auto-submit, or manual review rules.

### 2026-05-21. Workflow Wiring

- `.docx` resume import is wired into Options.
- Parsed profiles can be reviewed, edited, saved, and loaded as the active profile.
- Saved searches can be created, listed, checked manually, and deleted.
- Job page analysis saves or updates local job records.
- Application field analysis creates local sessions with notes, manual status, fill preview, approvals, and fill results.
- Local data export is available with a privacy warning. Import is validation-preview only for now.
- CI validates build, tests, typecheck, lint, and formatting on GitHub.

### 2026-05-21. Project Foundation

- Manifest V3 extension skeleton with popup, side panel, options page, service worker, and user-triggered content analysis.
- Strict TypeScript, React, Vite, Vitest, ESLint, and Prettier setup.
- Local storage wrappers for Chrome storage and IndexedDB.
- Deterministic job-page extraction, form-field detection, CAPTCHA and bot-check detection, sensitive-field rules, field mapping, and safe fill preview/fill execution.
- Local resume text parsing and initial `.docx` extraction support through `mammoth`.
- AI provider interfaces with a manual local fallback. AI requests require explicit review before anything is sent.
- Fake-only fixtures and unit tests for core logic.

Known limitations are documented in [docs/roadmap.md](docs/roadmap.md).

## Public Repo Privacy Warning

This repository is public. Do not commit real resumes, real profile data, real job application data, browser storage dumps, cookies, tokens, API keys, logs with private data, or generated exports. Fixtures must be fake and clearly safe for public use.

Use examples like `alex@example.com`. Do not use real user data, even temporarily.

## Local Development

Install dependencies:

```bash
npm install
```

Run the development build:

```bash
npm run dev
```

Build the extension:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run type checking and linting:

```bash
npm run typecheck
npm run lint
npm run format
```

## Load The Extension In Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select the `dist` folder.

The extension uses `activeTab`, `scripting`, `storage`, and `sidePanel`. It does not request default broad host permissions. Page analysis and field detection are user-triggered.

## Basic Workflow

1. Open Options.
2. Paste resume text or import a `.docx` resume.
3. Review and edit the parsed profile.
4. Save the profile locally.
5. Open a job page and analyze it from the side panel.
6. Analyze application fields.
7. Edit field values, approve safe fields, and skip unclear fields.
8. Fill approved fields only.
9. Review the page yourself and submit manually if you choose.

Saved searches are local records. The extension records manual check status but does not crawl job boards in the background.

## Security And Privacy Summary

User data stays local by default. Profile data, pasted resume text, saved jobs, saved searches, field mapping history, and application sessions are stored in local browser storage.

AI is disabled by default. If a provider is configured later, the extension must show the data that would be sent and wait for user approval. The current fallback uses local rules only.

The extension does not inject remote scripts, use `eval`, log private data, or submit forms.

Exports may contain private data. Keep `rapid-robot-job-assistant-export.json` out of git and shared folders.

## CAPTCHA And Bot Checks

Rapid Robot Job Assistant detects common CAPTCHA, bot-check, MFA, one-time-passcode, and verification patterns. When detected, it pauses filling and shows a manual verification status. It does not solve, click, bypass, or outsource challenges.

## No Auto-Submit Policy

The extension can fill reviewed fields after approval. It does not click final submit buttons, apply buttons, or hidden navigation that could submit an application. Final review and submission belong to the user.

## Fake Fixture Policy

Tests and examples use fake data only. Do not copy real job applications, resumes, profile exports, screenshots, storage dumps, or logs into this repo.

## Major Dependencies

- React and React DOM for extension UI.
- Vite for local development and extension bundling.
- TypeScript for typed models and message contracts.
- `idb` for a small IndexedDB wrapper.
- `mammoth` for initial `.docx` resume text extraction.
- Vitest and jsdom for unit tests.
- ESLint and Prettier for baseline project hygiene.

## License

Rapid Robot Job Assistant is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
