import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// The repository-level CI also contains independent node:test runners in scripts/.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    include: ["packages/dsh-plugin/tests/**/*.test.{ts,tsx}"],
    globalSetup: ["./scripts/ci-book-check.mjs"]
  }
});
