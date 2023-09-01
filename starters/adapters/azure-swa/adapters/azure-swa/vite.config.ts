import { azureSwaAdapter } from "@builder.io/qwik-city/adapters/azure-swa/vite";
import { extendConfig } from "@builder.io/qwik-city/vite";
import baseConfig from "../../vite.config";

export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      outDir: "azure-functions/render",
      rollupOptions: {
        input: ["src/entry.azure-swa.tsx", "@qwik-city-plan"],
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
