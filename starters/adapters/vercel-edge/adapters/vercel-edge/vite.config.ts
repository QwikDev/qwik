import { vercelEdgeAdapter } from "@qwik.dev/router/adapters/vercel-edge/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config.ts";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.vercel-edge.tsx"],
      },
      outDir: ".vercel/output/functions/_qwik-router.func",
    },
    plugins: [vercelEdgeAdapter()],
  };
});
