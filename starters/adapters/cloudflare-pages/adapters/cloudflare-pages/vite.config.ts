import { cloudflarePagesAdapter } from "@qwikdev/city/adapters/cloudflare-pages/vite";
import { extendConfig } from "@qwikdev/city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.cloudflare-pages.tsx", "@qwik-city-plan"],
      },
    },
    plugins: [cloudflarePagesAdapter()],
  };
});
