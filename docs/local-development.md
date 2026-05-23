# Local Development

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

The Chrome extension should be loaded from the built `dist` folder. Source HTML files under `src` are not loaded directly in Chrome. The build copies the shared stylesheet into `dist/shared/styles.css`, builds a standalone injectable content script at `dist/content/pageAnalyzer.js`, and validates both outputs.

After code changes, run `npm run build` and reload the unpacked extension from `dist`. Chrome will keep using the old build until the unpacked extension is reloaded.

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

If Chrome does not load the extension or a page appears unstyled, run `npm run build` again and reload `dist`. If a page command fails, make sure the active tab is an `http` or `https` page and run the action from a user-triggered button.

Analyze and fill commands only run on normal `http` and `https` pages. Chrome blocks extensions from internal pages such as `chrome://extensions`, extension pages, browser settings pages, local files, and Chrome Web Store pages.

Normal web pages can be analyzed from the popup or side panel button with `activeTab`. If Chrome still blocks script injection, use **Allow This Site** as a fallback. That requests only the current origin, such as `https://example.com/*`. If permission is granted but analysis still fails, reload the page and try the command again.

### Content Script Did Not Start

If the UI says the content script did not start, run `npm run build`, reload the unpacked extension from `dist`, reload the web page, and retry analysis. The build validator fails if `dist/content/pageAnalyzer.js` imports shared asset chunks because that breaks the dynamic injection path.

### Stale Dist Build

If source changes appear correct but Chrome still behaves the old way, the unpacked extension is probably still using an old `dist` build. Rebuild and reload the extension.

### Host Access Blocked

If Chrome blocks page access, click **Allow This Site**, reload the page, and retry analysis. The permission request is current-origin only.

### Restricted Internal Page

Chrome internal pages, extension pages, local files, and Chrome Web Store pages cannot be analyzed. Open a normal `http` or `https` page.

### Page Changed During Analysis

If the active page changed before analysis finished, open the target page again and retry. The extension only reports this when the tab id or URL changed during the command.

### Assistant Did Not Open

Use **Open Assistant** from the popup. The extension tries the side panel first. If Chrome does not open it, the extension automatically opens `sidepanel/sidepanel.html` as a full assistant tab.

The assistant tab does not need a normal web page just to open. To run analysis from the assistant tab, first open the job or application page, open the assistant from that page, and choose **Use This Page** so the extension targets the right tab.

When **Open Assistant** is clicked from a normal job or application page, the extension remembers that page before opening the assistant tab. If the assistant says no target page is selected, go back to the job page, open the assistant, and choose **Use This Page**. Close stale assistant tabs when testing UI changes. Rebuild and reload `dist` if the UI still shows old wording.

## Local Workflow Check

Use Options to import a fake pasted resume or `.docx`, save the profile, then open a normal job page and choose **Open Assistant On This Page** from the popup. Analyze the job, analyze the form, review values, and fill only approved fields. The extension does not submit applications.

When testing UI changes, close stale assistant tabs, run `npm run build`, reload the unpacked extension from `dist`, and reload the target web page.

## Browser Checks

Chrome is the primary target for this build. If Brave is available, test with Shields in their normal state and confirm the extension only shows guidance when forms or iframes are missing. If Edge or another Chromium browser is available, confirm the in-page assistant works without relying on side panel support.

The build must keep `dist/content/pageAnalyzer.js` standalone. `npm run build` runs the validator that catches top-level imports or asset chunk references in the injected content script.
