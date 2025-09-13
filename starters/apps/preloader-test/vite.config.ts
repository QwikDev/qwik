/**
 * This is the base config for vite.
 * When building, the adapter config is used which loads this file and extends it.
 */
import { defineConfig, type UserConfig, type Plugin } from "vite";
import { qwikVite } from "@qwik.dev/core/optimizer";
import { qwikRouter } from "@qwik.dev/router/vite";
import crypto from "crypto";
import tsconfigPaths from "vite-tsconfig-paths";
import basicSsl from "@vitejs/plugin-basic-ssl";
/**
 * Note that Vite normally starts from `index.html` but the qwikRouter plugin makes start at `src/entry.ssr.tsx` instead.
 */
function createBulkPlugin(): Plugin {
  return {
    name: "add-bulk-and-track",
    transform(code, id) {
      // Only process JavaScript/TypeScript files
      if (!id.match(/(\.[cm]?[jt]sx?$|@qwik)/)) {
        return null;
      }

      // Generate deterministic bulk based on filename
      const hash = crypto.createHash("sha256").update(id).digest();

      // Create bulk with an exponential-like distribution between 0kb and 50kb
      // Most files will be closer to 0kb, with a few reaching 50kb
      const maxSize = 500;
      const x = hash[0] / 255; // Normalize first byte to 0-1
      const exp = Math.pow(x, 6); // Skew distribution
      const bulkSize = Math.floor(maxSize * exp);

      // Create repeatable random bulk using the hash as seed
      const prng = crypto.createHash("sha512").update(id).digest();
      const bulk = Array.from({ length: Math.ceil(bulkSize / 64) }, (_, i) => {
        // Use the hash as a seed to generate new random blocks
        const block = crypto
          .createHash("sha512")
          .update(prng)
          .update(Buffer.from([i]))
          .digest("base64");
        return block;
      }).join("");

      // Add tracking code and bulk assignment at the start of each module
      const trackingCode = `
        console.log(">>> running", ${JSON.stringify(id)});
        ;(globalThis._loaded||=[]).push(${JSON.stringify(id)});
      `;
      const bulkCode = `
        globalThis._fakeBulk?.(${JSON.stringify(bulk)});
      `;

      return {
        /** Note that this code is injected before the import statements which is technically incorrect but Vite handles it */
        code: `${trackingCode}\n${code}\n${bulkCode}`,
        map: null,
      };
    },
  };
}

export default defineConfig((): UserConfig => {
  return {
    plugins: [
      qwikRouter(),
      qwikVite({ debug: true }),
      createBulkPlugin(),
      tsconfigPaths({ root: "." }),
      basicSsl(),
    ],
    build: {
      minify: false,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Put library code in separate chunks
            if (id.includes("vendor-lib")) {
              return id;
            }
          },
        },
      },
    },
  };
});
