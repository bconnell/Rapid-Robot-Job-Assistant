/* global console, process */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateContentScriptText(contentScript) {
  if (/^\s*import\s/m.test(contentScript)) {
    throw new Error('dist/content/pageAnalyzer.js must not contain top-level import statements.');
  }
  if (contentScript.includes('../assets') || contentScript.includes('/assets/')) {
    throw new Error('dist/content/pageAnalyzer.js must not reference shared asset chunks.');
  }
  if (!contentScript.includes('PING_CONTENT_SCRIPT')) {
    throw new Error(
      'dist/content/pageAnalyzer.js is missing the content-script readiness command.'
    );
  }
}

export function validateBuildOutput(root = 'dist') {
  const pages = ['options', 'popup', 'sidepanel'];
  const cssPath = resolve(root, 'shared/styles.css');

  if (!existsSync(cssPath)) {
    throw new Error('Build output is missing dist/shared/styles.css.');
  }

  for (const page of pages) {
    const htmlPath = resolve(root, `${page}/${page}.html`);
    if (!existsSync(htmlPath)) {
      throw new Error(`Build output is missing ${htmlPath}.`);
    }
    const html = readFileSync(htmlPath, 'utf8');
    if (!html.includes('../shared/styles.css')) {
      throw new Error(`${page}.html does not reference ../shared/styles.css.`);
    }
  }

  const manifestPath = resolve(root, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('Build output is missing dist/manifest.json.');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.background?.service_worker !== 'background/serviceWorker.js') {
    throw new Error('dist/manifest.json must reference background/serviceWorker.js.');
  }

  const contentScriptPath = resolve(root, 'content/pageAnalyzer.js');
  if (!existsSync(contentScriptPath)) {
    throw new Error('Build output is missing dist/content/pageAnalyzer.js.');
  }
  validateContentScriptText(readFileSync(contentScriptPath, 'utf8'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateBuildOutput();
  console.log('Build output includes deterministic shared styles and a standalone content script.');
}
