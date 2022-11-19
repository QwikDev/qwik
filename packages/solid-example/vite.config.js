import { resolve } from 'path';
import { defineConfig } from 'vite';
import babel from "@rollup/plugin-babel";
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
    lib: {
      entry: resolve(__dirname, "src/App.tsx"),
      name: "solid-example",
      fileName: 'solid-example'
    },
    rollupOptions: {
      external: ['solid-js', 'solid-js/web'],
      output: {
        globals: {
          'solid-js': 'solid-js'
        }
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          presets: [["solid", { generate: "dom", hydratable: true }]]
        }),
      ]
    }
  },
});
