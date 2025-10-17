/**
 * This is the base config for vite.
 * When building, the adapter config is used which loads this file and extends it.
 */
import { qwikVite } from "@qwik.dev/core/optimizer";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig((config): UserConfig => {
  return {
    plugins: [
      qwikVite({ csr: true }),
      tsconfigPaths({ root: "." }),
      config.mode === "development" &&
        viteStaticCopy({
          targets: [
            {
              src: "./node_modules/@qwik.dev/core/dist/qwikloader.js",
              dest: "@qwik.dev/core",
            },
          ],
        }),
    ],
  };
});
