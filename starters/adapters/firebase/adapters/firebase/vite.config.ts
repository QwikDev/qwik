import { nodeServerAdapter } from "@qwik.dev/city/adapters/node-server/vite";
import { extendConfig } from "@qwik.dev/city/vite";
import { builtinModules } from "module";
import baseConfig from "../../vite.config";
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
        input: ["./src/entry-firebase.tsx", "@qwik-city-plan"],
      },
      outDir: "./functions/server",
    },
    plugins: [nodeServerAdapter({ name: "firebase" })],
  };
});
