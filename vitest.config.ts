import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/server/game/**/*.ts"],
      exclude: ["src/server/game/types.ts"],
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 85,
        statements: 85
      }
    }
  }
});
