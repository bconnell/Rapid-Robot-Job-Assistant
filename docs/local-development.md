# Local Development

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

The Chrome extension should be loaded from the built `dist` folder. Source HTML files under `src` are not loaded directly in Chrome. The build copies the shared stylesheet into `dist/shared/styles.css` and validates that popup, side panel, and Options HTML files reference it.

## Test

```bash
npm test
npm run typecheck
npm run lint
npm run format
```

## Load Unpacked

1. Build the extension.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select `dist`.

## Folder Structure

- `src/manifest`: Manifest V3 config.
- `src/background`: service worker.
- `src/content`: page analysis, field detection, mapping, filling, and CAPTCHA detection.
- `src/popup`: popup UI.
- `src/sidepanel`: main review UI.
- `src/options`: local settings and profile UI.
- `src/shared`: models, services, storage, parsing, AI abstractions, and utilities.
- `tests`: fake fixtures and unit tests.
- `docs`: project guidance.

## Troubleshooting

If Chrome does not load the extension or a page appears unstyled, run `npm run build` again and reload `dist`. If a page command fails, make sure the active tab is an `http` or `https` page and run the action from a user gesture.

## Local Workflow Check

Use Options to import a fake pasted resume or `.docx`, save the profile, then use the side panel to analyze a job page and an application form. Fill only approved fields. The extension does not submit applications.
