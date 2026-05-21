# Privacy Model

Rapid Robot Job Assistant is local-first.

## Stored Locally

- User profile data
- Pasted resume text
- Parsed resume sections
- Saved job postings
- Saved searches
- Application sessions
- Field mappings
- Tailoring suggestions
- Local settings

Settings are stored in `chrome.storage.local`. Larger structured records are stored in IndexedDB.

## AI Requests

AI is disabled by default. If a provider is configured later, the user must review what would be sent before any request leaves the browser. Redaction is applied where possible, but review is still required.

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

## Clear Data

The options page includes a clear local data control. It clears extension settings and IndexedDB records. It does not touch browser settings, OS settings, downloads, or files outside the extension storage area.

## Public Repo Rule

Do not commit real user data. Fixtures, examples, tests, screenshots, and docs must use fake data only.
