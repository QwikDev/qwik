import { cloudRunAdapter } from "@qwik.dev/city/adapters/cloud-run/vite";
import { extendConfig } from "@qwik.dev/city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.cloud-run.tsx", "@qwik-city-plan"],
      },
    },
    plugins: [cloudRunAdapter()],
  };
});
