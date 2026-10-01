/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'happy-dom', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        // Pure server-side libraries in functions/src/lib (offset, places, thresholds).
        test: { name: 'functions', environment: 'node', include: ['tests/functions/**/*.test.ts'] },
      },
    ],
  },
})
