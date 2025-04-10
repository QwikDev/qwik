import { defineConfig } from "vite";
import { qwikVite } from "@builder.io/qwik/optimizer";
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
