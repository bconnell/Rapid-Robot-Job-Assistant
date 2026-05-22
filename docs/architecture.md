# Architecture

Rapid Robot Job Assistant is a Manifest V3 Chrome extension with no backend in Batch 1.

## Components

- Popup: quick actions for opening the side panel, analyzing the current job page, analyzing application fields, and opening options.
- Side panel: main review workspace for job summary, profile match, tailoring suggestions, field mapping, fill preview, verification status, and notes.
- Options page: local profile/resume setup, AI settings, saved search controls, privacy controls, and clear-data action.
- Background service worker: routes user-triggered commands and injects the content analyzer into the active tab.
- Content analyzer: extracts job details, detects form fields, maps fields, checks CAPTCHA/bot patterns, and fills only approved fields.
- Shared services: typed models, storage wrappers, parsing, AI abstractions, privacy guards, and deterministic matching.

## Message Flow

The popup or side panel sends a command to the service worker. The service worker injects `content/pageAnalyzer.js` into the active tab through `chrome.scripting.executeScript`, then sends a typed command to the content script.

Content responses are structured data. Private page text is not logged.

## Storage Flow

Small settings use `chrome.storage.local`. Larger local records use IndexedDB:

- Profiles
- Resume documents
- Job postings
- Application sessions
- Field mapping history
- Saved searches
- Tailoring suggestions

Typed repository wrappers sit on top of the generic IndexedDB wrapper for profiles, resume documents, job postings, application sessions, saved searches, field mappings, and tailoring suggestions.

## AI Flow

AI is disabled by default. Batch 1 includes provider interfaces and local manual rules. Any future provider call must create a review preview, redact sensitive text where possible, and wait for explicit user approval.

## Form Filling Flow

The extension detects fields, maps them with deterministic rules, shows a preview, and fills only approved fields. It does not click submit, apply, CAPTCHA, MFA, or bot-check controls.

Batch 2 persists the application session for the current page. Sessions store the field preview, notes, fill results, manual verification state, and user-marked status.
