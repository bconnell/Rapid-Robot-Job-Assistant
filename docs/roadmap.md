# Roadmap

## Completed Foundation

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
- Resume parsing is improved but still review-first. Users should verify every parsed field.
- Chrome Web Store packaging and publishing are future work.

## Completed Workflow Wiring

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

## Options UI And Resume Parsing Hardening Completed

- Options uses a centered main/sidebar layout instead of wide-screen auto-fit columns.
- Cards align to the top and no longer stretch into large empty panels.
- Resume Import and Profile Review have more usable width.
- Clear Local Data is a normal danger action button.
- Docs are shown as a compact link list.
- `.docx` and pasted text normalization handles common glued labels and headings.
- Resume section aliases are recognized for summary, skills, experience, education, certifications, and projects.
- Contact parsing avoids email over-capture and detects LinkedIn/GitHub links without a protocol.
- Skills, experience, and education parsing handle more realistic fake resume structures.
- Options shows a compact parser summary and review warnings.

## Browser QA Styling And Parser Fixes Completed

- Built extension pages now reference a deterministic shared stylesheet in `dist/shared/styles.css`.
- Build validation checks that popup, side panel, and Options can load shared styles from the unpacked `dist` folder.
- Options layout has stronger guards against horizontal overflow, stretched cards, and ultra-wide columns.
- Education parsing better separates degree, field, school, city, honors, and graduation dates from glued `.docx` text.
- Experience parsing has regression coverage for hyphen-separated fake roles.
- Certification parsing has regression coverage to stop before later sections.

## Site Permission And Command Reliability Completed

- Analyze and fill commands preflight the active tab before trying to inject content scripts.
- Restricted pages now show a clear blocked-page message instead of a generic command failure.
- Popup and side panel can request current-site permission from a user action.
- Permission requests use the current origin only, not broad default host access.
- Failed permission or restricted-page commands do not save empty jobs or application sessions.
- Injection and content-message failures return safer reload-and-retry guidance.

## Possible Next Work

- Add safe merge/replace import after another review pass.
- Continue real browser QA fixes as they appear.
- Add better application form fixtures.
- Add visible search-result extraction for controlled fake fixtures and current-page only.
- Add richer application session history.
- Add optional site permission management.
- Add a small permissions view for reviewing and removing granted sites.
- Add stronger manual QA pages for extension testing.
- Add controlled browser QA fixtures.
