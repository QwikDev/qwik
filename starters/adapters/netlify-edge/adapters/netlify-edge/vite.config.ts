import { netlifyEdgeAdapter } from "@qwik.dev/router/adapters/netlify-edge/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config.ts";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.netlify-edge.tsx"],
      },
      outDir: ".netlify/edge-functions/entry.netlify-edge",
    },
    plugins: [netlifyEdgeAdapter()],
  };
});
