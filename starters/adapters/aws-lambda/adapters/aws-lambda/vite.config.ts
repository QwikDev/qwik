import { nodeServerAdapter } from "@qwik.dev/router/adapters/node-server/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import { builtinModules } from "module";
import baseConfig from "../../vite.config.ts";

// @ts-expect-error - incompatible types between vite 7 and vite 8-beta
export default extendConfig(baseConfig, () => {
  return {
    ssr: {
      // This configuration will bundle all dependencies, except the node builtins (path, fs, etc.)
      external: builtinModules,
      noExternal: /./,
    },
    build: {
      minify: false,
      ssr: true,
      rollupOptions: {
        input: ["./src/entry_aws-lambda.tsx"],
      },
    },
    plugins: [nodeServerAdapter({ name: "aws-lambda" })],
  };
});
