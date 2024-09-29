import { cloudflarePagesAdapter } from "@qwik.dev/city/adapters/cloudflare-pages/vite";
import { extendConfig } from "@qwik.dev/city/vite";
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
