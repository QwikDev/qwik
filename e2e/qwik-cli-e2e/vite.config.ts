import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// if we're running in github CI
if (process.env.CI) {
  // Workaround for npm/pnpm crashing in scaffoldQwikProject because "name is too long"
  const testPath = resolve(process.cwd(), "e2e-test-tmp");

  // Create base directory if it doesn't exist
  if (!existsSync(testPath)) {
    mkdirSync(testPath);
  }

  // Create subdirectories for each template type
  const templateTypes = ["empty", "playground"];
  for (const type of templateTypes) {
    const templatePath = resolve(testPath, type);
    if (!existsSync(templatePath)) {
      mkdirSync(templatePath);
    }
  }

  process.env.TEMP_E2E_PATH = testPath;
}

export default defineConfig({
  plugins: [tsconfigPaths({ root: "../../" })],
  test: {
    include: ["./tests/*.spec.?(c|m)[jt]s?(x)"],
    setupFiles: ["./utils/setup.ts"],
    // Run only one test at a time to avoid potential conflicts.
    // These tests interact directly with the filesystem and/or run processes on localhost,
    // which can lead to issues if multiple tests are executed simultaneously
    fileParallelism: false,
  },
});
