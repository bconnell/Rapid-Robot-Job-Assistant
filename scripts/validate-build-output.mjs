/* global console */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pages = ['options', 'popup', 'sidepanel'];
const cssPath = resolve('dist/shared/styles.css');

if (!existsSync(cssPath)) {
  throw new Error('Build output is missing dist/shared/styles.css.');
}

for (const page of pages) {
  const htmlPath = resolve(`dist/${page}/${page}.html`);
  if (!existsSync(htmlPath)) {
    throw new Error(`Build output is missing ${htmlPath}.`);
  }
  const html = readFileSync(htmlPath, 'utf8');
  if (!html.includes('../shared/styles.css')) {
    throw new Error(`${page}.html does not reference ../shared/styles.css.`);
  }
}

console.log('Build output includes deterministic shared stylesheet links.');
