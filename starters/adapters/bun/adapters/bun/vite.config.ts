import { bunServerAdapter } from "@builder.io/qwik-city/adapters/bun-server/vite";
import { extendConfig } from "@builder.io/qwik-city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.bun.ts", "@qwik-city-plan"],
      },
      minify: false,
    },
    plugins: [
      bunServerAdapter({
        ssg: {
          include: ["/*"],
          origin: "https://yoursite.dev",
        },
      }),
    ],
  };
});
