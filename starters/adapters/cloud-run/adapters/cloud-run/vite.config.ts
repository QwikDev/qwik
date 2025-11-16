import { cloudRunAdapter } from "@qwik.dev/router/adapters/cloud-run/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config.ts";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.cloud-run.tsx"],
      },
    },
    plugins: [cloudRunAdapter()],
  };
});
