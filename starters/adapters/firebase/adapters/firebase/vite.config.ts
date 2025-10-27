import { nodeServerAdapter } from "@qwik.dev/router/adapters/node-server/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import { builtinModules } from "module";
import baseConfig from "../../vite.config.ts";
export default extendConfig(baseConfig, () => {
  return {
    ssr: {
      external: builtinModules,
      noExternal: /./,
    },
    build: {
      minify: false,
      ssr: true,
      rollupOptions: {
        input: ["./src/entry-firebase.tsx"],
      },
      outDir: "./functions/server",
    },
    plugins: [nodeServerAdapter({ name: "firebase" })],
  };
});
