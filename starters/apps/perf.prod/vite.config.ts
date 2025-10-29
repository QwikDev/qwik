import { defineConfig } from "vite";
import { qwikVite } from "@qwik.dev/core/optimizer";
export default defineConfig({
  plugins: [
    qwikVite({
      debug: true,
    }),
  ],
  build: {
    minify: true,
  },
});
