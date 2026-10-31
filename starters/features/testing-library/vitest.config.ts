import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      // qwik-testing-library needs to consider your project as a Qwik lib
      // if it's already a Qwik lib, you can remove this section
      build: {
        target: "es2020",
        lib: {
          entry: "./src/index.ts",
          formats: ["es", "cjs"],
          fileName: (format, entryName) =>
            `${entryName}.qwik.${format === "es" ? "mjs" : "cjs"}`,
        },
      },
      // configure your test environment
      test: {
        environment: "jsdom",
        setupFiles: ["./vitest.setup.ts"],
        globals: true,
      },
    }),
  ),
);
