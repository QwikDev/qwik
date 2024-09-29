import { netlifyEdgeAdapter } from "@qwik.dev/city/adapters/netlify-edge/vite";
import { extendConfig } from "@qwik.dev/city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.netlify-edge.tsx", "@qwik-city-plan"],
      },
      outDir: ".netlify/edge-functions/entry.netlify-edge",
    },
    plugins: [netlifyEdgeAdapter()],
  };
});
