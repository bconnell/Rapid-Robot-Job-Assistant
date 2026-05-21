import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function copyManifest(): Plugin {
  return {
    name: 'copy-extension-manifest',
    writeBundle() {
      mkdirSync(resolve('dist'), { recursive: true });
      copyFileSync(resolve('src/manifest/manifest.json'), resolve('dist/manifest.json'));
    }
  };
}

function copyHtmlEntries(): Plugin {
  const pages = ['popup', 'sidepanel', 'options'];
  return {
    name: 'copy-extension-html',
    writeBundle() {
      for (const page of pages) {
        const source = resolve(`src/${page}/${page}.html`);
        const target = resolve(`dist/${page}/${page}.html`);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
    }
  };
}

function copyDocs(): Plugin {
  return {
    name: 'copy-docs',
    writeBundle() {
      copyDirectory(resolve('docs'), resolve('dist/docs'));
    }
  };
}

function copyDirectory(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    const sourcePath = resolve(source, entry);
    const targetPath = resolve(target, entry);
    if (statSync(sourcePath).isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      copyFileSync(sourcePath, targetPath);
    }
  }
}

export default defineConfig({
  plugins: [react(), copyManifest(), copyHtmlEntries(), copyDocs()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'background/serviceWorker': resolve(__dirname, 'src/background/serviceWorker.ts'),
        'content/pageAnalyzer': resolve(__dirname, 'src/content/pageAnalyzer.ts'),
        'popup/main': resolve(__dirname, 'src/popup/main.tsx'),
        'sidepanel/main': resolve(__dirname, 'src/sidepanel/main.tsx'),
        'options/main': resolve(__dirname, 'src/options/main.tsx')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
