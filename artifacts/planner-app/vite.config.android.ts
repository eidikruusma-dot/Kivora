/**
 * vite.config.android.ts
 *
 * Capacitor Android build — base must be "/" (no path prefix).
 * Output goes to dist/android/, which capacitor.config.ts points at as webDir.
 * Does NOT depend on PORT or BASE_PATH env vars (Replit-only concerns).
 */
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        (await import('tailwindcss')).default,
        (await import('autoprefixer')).default,
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/android'),
    emptyOutDir: true,
  },
})
