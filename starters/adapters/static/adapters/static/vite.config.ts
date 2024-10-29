import { staticAdapter } from "@qwik.dev/router/adapters/static/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["@qwik-router-config"],
      },
    },
    plugins: [
      staticAdapter({
        origin: "https://yoursite.qwik.dev",
      }),
    ],
  };
});
