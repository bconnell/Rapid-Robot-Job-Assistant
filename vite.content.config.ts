import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/content',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/pageAnalyzer.ts'),
      name: 'RapidRobotJobAssistantContentScript',
      formats: ['iife'],
      fileName: () => 'pageAnalyzer.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
