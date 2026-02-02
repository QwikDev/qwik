import { ssgAdapter } from "@qwik.dev/router/adapters/ssg/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config.ts";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["@qwik-router-config"],
      },
    },
    plugins: [
      ssgAdapter({
        origin: "https://yoursite.qwik.dev",
      }),
    ],
  };
});
