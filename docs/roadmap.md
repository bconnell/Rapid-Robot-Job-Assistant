# Roadmap

## Batch 1 Completed Foundation

- MV3 extension structure.
- React popup, side panel, and options page.
- Service worker command routing.
- User-triggered job page extraction.
- User-triggered field detection and mapping.
- Safe fill function for approved fields.
- CAPTCHA and bot-check pause detection.
- Local storage wrappers.
- Resume text parsing.
- Initial `.docx` extraction support in code.
- AI provider abstractions and local manual fallback.
- Fake fixtures and unit tests.
- Public repo safety docs.

## Known Limitations

- Saved search checking is conservative and manual. There is no background crawling.
- Field filling avoids file uploads and navigation.
- Import is validation-preview only in Batch 2.
- AI provider network calls are scaffolded but intentionally not executed.
- Chrome Web Store packaging and publishing are future work.

## Batch 2 Completed Workflow Wiring

- `.docx` resume import is wired into Options.
- Profile review/edit/save/load works locally.
- Active profile ID is stored in `chrome.storage.local`.
- Saved searches can be created, listed, manually checked, and deleted.
- Job analysis saves or updates local job records.
- Application sessions persist field preview, notes, manual verification state, fill results, and user-marked status.
- Side panel has per-field edit, approve, skip, bulk-safe approval, clear approvals, and fill-result feedback.
- Profile value resolution fills only saved values and does not invent missing data.
- Local export is implemented with a privacy warning.
- Import validates JSON and shows preview counts, but does not merge records yet.
- CI runs install, build, test, typecheck, lint, and format.

## Possible Batch 3 Items

- Add safe merge/replace import after another review pass.
- Add visible search-result extraction for controlled fake fixtures and current-page only.
- Add richer application session history.
- Add stronger manual QA pages for extension testing.
- Add controlled browser QA fixtures.
