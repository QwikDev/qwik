import { nodeServerAdapter } from "@qwikdev/city/adapters/node-server/vite";
import { extendConfig } from "@qwikdev/city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.fastify.tsx", "@qwik-city-plan"],
      },
    },
    plugins: [nodeServerAdapter({ name: "fastify" })],
  };
});
