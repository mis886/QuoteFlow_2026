import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

// 2026-11-18: one ID per build, baked into the app (__APP_BUILD_ID__) and
// written to dist/version.json. An open tab compares the two every few
// minutes (src/lib/appVersion.ts) and offers "New version available — Reload".
const BUILD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const versionJson = (): Plugin => ({
  name: 'quoteflow-version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId: BUILD_ID }) });
  },
});

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), versionJson()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    },
    build: {
      // Split the previously single 1.97 MB bundle into vendor chunks
      // so users only re-download what changed. Heavy PDF deps load
      // only on pages that import them (Print Job Card, Quote PDF).
      rollupOptions: {
        maxParallelFileOps: 20,
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
            if (id.includes('@supabase'))                            return 'supabase';
            if (id.includes('lucide-react'))                         return 'icons';
            if (id.includes('react-router'))                         return 'router';
            if (id.includes('react-dom'))                            return 'react-dom';
            if (id.includes('date-fns'))                             return 'dates';
            if (id.includes('papaparse'))                            return 'papaparse';
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  };
});