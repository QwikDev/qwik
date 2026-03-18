import { qwikVite } from "@qwik.dev/core/optimizer";
import { qwikRouter } from "@qwik.dev/router/vite";
import { defineConfig } from "vite";
import pkg from "./package.json";
import tsconfigPaths from "vite-tsconfig-paths";

const { dependencies = {}, peerDependencies = {} } = pkg as any;
const makeRegex = (dep) => new RegExp(`^${dep}(/.*)?$`);
const excludeAll = (obj) => Object.keys(obj).map(makeRegex);
const external = [
  /^node:.*/,
  ...excludeAll(dependencies),
  ...excludeAll(peerDependencies),
];

export default defineConfig(() => {
  return {
    builder: {},
    build: {
      outDir: "lib",
      target: "es2020",
      lib: {
        entry: "./src/index",
        formats: ["es"],
        // This adds .qwik so all files are processed by the optimizer
        fileName: (_format, entryName) => `${entryName}.qwik.mjs`,
      },
      rollupOptions: {
        output: {
          preserveModules: true,
          preserveModulesRoot: "src",
        },
        external,
      },
    },
    environments: {
      "lib-server-dev": {
        consumer: "server",
        define: {
          "globalThis.qDev": true,
          "globalThis.qInspector": true,
          "globalThis.qSerialize": true,
          "globalThis.qTest": false,
        },
        build: {
          outDir: "lib",
          ssr: "./src/index",
          rollupOptions: {
            output: {
              preserveModules: true,
              preserveModulesRoot: "src",
              entryFileNames: "[name].server-dev.js",
            },
            external,
          },
        },
      },
      "lib-server-prod": {
        consumer: "server",
        define: {
          "globalThis.qDev": false,
          "globalThis.qInspector": false,
          "globalThis.qSerialize": false,
          "globalThis.qTest": false,
        },
        build: {
          outDir: "lib",
          ssr: "./src/index",
          minify: true,
          rollupOptions: {
            output: {
              preserveModules: true,
              preserveModulesRoot: "src",
              entryFileNames: "[name].server-prod.js",
            },
            external,
          },
        },
      },
    },
    plugins: [qwikVite(), qwikRouter(), tsconfigPaths({ root: "." })],
  };
});
