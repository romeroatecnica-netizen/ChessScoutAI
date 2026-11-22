import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

const rootDir = import.meta.dirname;

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-stockfish-engine',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distEngineDir = path.resolve(rootDir, 'dist', 'engine');
          const pkgDir = path.resolve(rootDir, 'node_modules', 'stockfish.js');
          const files = ['stockfish.js', 'stockfish.wasm', 'stockfish.wasm.js'];
          if (fs.existsSync(pkgDir)) {
            fs.mkdirSync(distEngineDir, {recursive: true});
            for (const file of files) {
              const src = path.join(pkgDir, file);
              const dest = path.join(distEngineDir, file);
              if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
              }
            }
          }
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." still resolve in production builds.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(rootDir, 'dist');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
