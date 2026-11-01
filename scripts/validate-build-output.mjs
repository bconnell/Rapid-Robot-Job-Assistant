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

  const noticesPath = resolve(root, 'THIRD-PARTY-NOTICES.txt');
  if (!existsSync(noticesPath)) {
    throw new Error('Build output is missing dist/THIRD-PARTY-NOTICES.txt.');
  }
  if (existsSync(resolve(root, 'content/THIRD-PARTY-NOTICES.txt'))) {
    throw new Error('Build output must not duplicate third-party notices in dist/content.');
  }

  for (const doc of [
    'application-workflow.md',
    'privacy-model.md',
    'browser-compatibility.md',
    'local-development.md'
  ]) {
    const docPath = resolve(root, 'docs', doc);
    if (!existsSync(docPath)) {
      throw new Error(`Build output is missing the packaged docs page ${docPath}.`);
    }
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
