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

- `.docx` parsing exists as a browser parser service but is not fully wired into the options UI yet.
- Saved search checking is conservative and UI-only in Batch 1.
- Field filling avoids file uploads and navigation.
- AI provider network calls are scaffolded but intentionally not executed in Batch 1.
- Chrome Web Store packaging and publishing are future work.

## Possible Batch 2 Items

- Wire `.docx` import into options after browser testing.
- Persist analyzed jobs and application sessions from the side panel.
- Add richer saved search management.
- Add a stronger fill-preview approval table.
- Add import/export with explicit private-data warnings.
- Add controlled browser QA fixtures.
