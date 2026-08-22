import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
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