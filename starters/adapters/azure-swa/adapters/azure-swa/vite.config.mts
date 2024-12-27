import { azureSwaAdapter } from "@qwik.dev/router/adapters/azure-swa/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import baseConfig from "../../vite.config.mts";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      outDir: "azure-functions/render",
      rollupOptions: {
        input: ["src/entry.azure-swa.tsx", "@qwik-router-config"],
        output: {
          entryFileNames: `[name].[hash].mjs`,
          chunkFileNames: `[name].[hash].mjs`,
        },
      },
    },
    ssr: {
      noExternal: /.*/,
    },
    plugins: [azureSwaAdapter()],
  };
});