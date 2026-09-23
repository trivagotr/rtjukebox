import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/config/cors.ts',
        'src/middleware/auth.ts',
        'src/middleware/rbac.ts',
      ],
      thresholds: {
        lines: 70,
      },
    },
  },
});
