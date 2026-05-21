# Local Development

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
npm run typecheck
npm run lint
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

If Chrome does not load the extension, run `npm run build` again and reload `dist`. If a page command fails, make sure the active tab is an `http` or `https` page and run the action from a user gesture.
