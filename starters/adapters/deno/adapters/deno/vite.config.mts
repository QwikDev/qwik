import { denoServerAdapter } from "@qwik.dev/router/adapters/deno-server/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config.mts";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.deno.ts", "@qwik-router-config"],
      },
      minify: false,
    },
    plugins: [
      denoServerAdapter({
        ssg: {
          include: ["/*"],
          origin: "https://yoursite.dev",
        },
      }),
    ],
  };
});