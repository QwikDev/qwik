import { nodeServerAdapter } from "@qwik.dev/city/adapters/node-server/vite";
import { extendConfig } from "@qwik.dev/city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rollupOptions: {
        input: ["src/entry.node-server.tsx", "@qwik-city-plan"],
      },
    },
    plugins: [nodeServerAdapter({ name: "node-server" })],
  };
});
