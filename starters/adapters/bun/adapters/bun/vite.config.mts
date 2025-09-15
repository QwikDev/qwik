import { bunServerAdapter } from "@qwik.dev/router/adapters/bun-server/vite";
import { _TextEncoderStream_polyfill } from "@qwik.dev/router/middleware/request-handler";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config.mts";

// This polyfill is required when you use SSG and build your app with Bun, because Bun does not have TextEncoderStream. See: https://github.com/oven-sh/bun/issues/5648
globalThis.TextEncoderStream ||= _TextEncoderStream_polyfill;

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.bun.ts"],
      },
      minify: false,
    },
    plugins: [
      bunServerAdapter({
        ssg: {
          include: ["/*"],
          origin: "https://yoursite.dev",
          maxWorkers: 1, // Limit Workers to 1, otherwise SSG will hang when compiling Qwik Router app with `bun run --bun build`.
        },
      }),
    ],
  };
});
