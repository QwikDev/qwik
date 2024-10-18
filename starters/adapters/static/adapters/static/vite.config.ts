import { staticAdapter } from "@qwik.dev/city/adapters/static/vite";
import { extendConfig } from "@qwik.dev/city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["@qwik-city-plan"],
      },
    },
    plugins: [
      staticAdapter({
        origin: "https://yoursite.qwik.dev",
      }),
    ],
  };
});
