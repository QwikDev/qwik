import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ root: "." })],
  test: {
    include: ["**/*.unit.?(c|m)[jt]s?(x)"],
    setupFiles: ["../../vitest-setup.ts"],
  },
});
