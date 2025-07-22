import { cloudflarePagesAdapter } from "@qwik.dev/router/adapters/cloudflare-pages/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config.mts";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.cloudflare-pages.tsx"],
      },
    },
    plugins: [
      cloudflarePagesAdapter({
        // Uncomment the below to enable SSG
        // NOTE: be sure to edit the public/_routes.json file to include only the routes you want to SSR
        //
        // ssg: {
        //   include: ["/", "/*"],
        //   exclude: ["/always-ssr/*"],
        //   origin:
        //     process.env.CF_PAGES_URL ?? "https://my-app.com",
        // },
      }),
    ],
  };
});
