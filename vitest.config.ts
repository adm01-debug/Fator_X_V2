import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'tests/rls/**', 'e2e/**'],
    // Renders de páginas inteiras em jsdom (DashboardPage, AppLayout) levam
    // ~1,7s isoladamente, mas passam de 5s quando dezenas de workers disputam
    // CPU — gerando flakes de "Test timed out in 5000ms" que não são bugs.
    // 20s dá folga sob carga; travamentos reais continuam sendo capturados
    // pelo `timeout-minutes: 10` do job de CI.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Placeholder Supabase env vars prevent externalClient.ts from throwing
    // "supabaseUrl is required" at module load time in the test environment.
    // Individual test files mock the clients via vi.mock() for real unit isolation.
    env: {
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'placeholder-anon-key',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      all: true,
      include: ['src/services/**', 'src/lib/**', 'src/hooks/**'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/tests/**'],
      thresholds: {
        lines: 41,
        functions: 60,
        branches: 46,
        statements: 41,
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
