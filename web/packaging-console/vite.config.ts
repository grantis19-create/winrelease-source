/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Ticket 07/ADR 0032: proxy to WinRelease.API's docker-compose port so the
      // browser only ever talks to this dev server's origin - sidesteps CORS
      // entirely instead of configuring AddCors/UseCors on the API.
      '/api': {
        // Defaults to the standard API port; set VITE_API_TARGET (e.g. http://localhost:8081) to point a
        // second checkout's dev server at its own API without colliding with the first.
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    // e2e/ holds Playwright specs (UAT T9, run by playwright.config.ts) - not vitest tests.
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-mvp/**', 'e2e/**'],
  },
})
