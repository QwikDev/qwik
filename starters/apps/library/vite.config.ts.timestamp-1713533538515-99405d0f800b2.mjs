// vite.config.ts
import { defineConfig } from "file:///media/zbook/Dati/giorgio/dev-null/qwik/node_modules/.pnpm/vite@5.1.6_@types+node@20.11.30_terser@5.29.2/node_modules/vite/dist/node/index.js";

// package.json
var package_default = {
  name: "qwik-library-name",
  description: "Create a reusable Qwik component library",
  version: "0.0.1",
  private: false,
  main: "./lib/index.qwik.mjs",
  qwik: "./lib/index.qwik.mjs",
  types: "./lib-types/index.d.ts",
  type: "module",
  exports: {
    ".": {
      import: "./lib/index.qwik.mjs",
      require: "./lib/index.qwik.cjs",
      types: "./lib-types/index.d.ts"
    }
  },
  files: [
    "lib",
    "lib-types"
  ],
  scripts: {
    build: "qwik build",
    "build.lib": "vite build --mode lib",
    "build.types": "tsc --emitDeclarationOnly",
    dev: "vite --mode ssr",
    "dev.debug": "node --inspect-brk ./node_modules/vite/bin/vite.js --mode ssr --force",
    fmt: "prettier --write .",
    "fmt.check": "prettier --check .",
    lint: 'eslint "src/**/*.ts*"',
    test: 'echo "No test specified" && exit 0',
    start: "vite --open --mode ssr",
    qwik: "qwik",
    release: "np"
  },
  devDependencies: {
    "@builder.io/qwik": "latest",
    "@types/eslint": "latest",
    "@types/node": "latest",
    "@typescript-eslint/eslint-plugin": "latest",
    "@typescript-eslint/parser": "latest",
    eslint: "latest",
    "eslint-plugin-qwik": "latest",
    np: "^8.0.4",
    prettier: "latest",
    typescript: "latest",
    undici: "latest",
    vite: "^4.5.2",
    "vite-tsconfig-paths": "^4.2.1"
  },
  __qwik__: {
    displayName: "Component library (Qwik)",
    priority: -1,
    docs: [
      "https://qwik.dev/docs/getting-started/"
    ]
  }
};

// vite.config.ts
import { qwikVite } from "file:///media/zbook/Dati/giorgio/dev-null/qwik/packages/qwik/dist/optimizer.mjs";
import tsconfigPaths from "file:///media/zbook/Dati/giorgio/dev-null/qwik/node_modules/.pnpm/vite-tsconfig-paths@4.3.2_typescript@5.3.3_vite@5.1.6/node_modules/vite-tsconfig-paths/dist/index.mjs";
var { dependencies = {}, peerDependencies = {} } = package_default;
var makeRegex = (dep) => new RegExp(`^${dep}(/.*)?$`);
var excludeAll = (obj) => Object.keys(obj).map(makeRegex);
var vite_config_default = defineConfig(() => {
  return {
    build: {
      target: "es2020",
      lib: {
        entry: "./src/index.ts",
        formats: ["es", "cjs"],
        fileName: (format) => `index.qwik.${format === "es" ? "mjs" : "cjs"}`
      },
      rollupOptions: {
        // externalize deps that shouldn't be bundled into the library
        external: [
          /^node:.*/,
          ...excludeAll(dependencies),
          ...excludeAll(peerDependencies)
        ]
      }
    },
    plugins: [qwikVite(), tsconfigPaths()]
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAicGFja2FnZS5qc29uIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL21lZGlhL3pib29rL0RhdGkvZ2lvcmdpby9kZXYtbnVsbC9xd2lrL3N0YXJ0ZXJzL2FwcHMvbGlicmFyeVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL21lZGlhL3pib29rL0RhdGkvZ2lvcmdpby9kZXYtbnVsbC9xd2lrL3N0YXJ0ZXJzL2FwcHMvbGlicmFyeS92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vbWVkaWEvemJvb2svRGF0aS9naW9yZ2lvL2Rldi1udWxsL3F3aWsvc3RhcnRlcnMvYXBwcy9saWJyYXJ5L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCBwa2cgZnJvbSBcIi4vcGFja2FnZS5qc29uXCI7XG5pbXBvcnQgeyBxd2lrVml0ZSB9IGZyb20gXCJAYnVpbGRlci5pby9xd2lrL29wdGltaXplclwiO1xuaW1wb3J0IHRzY29uZmlnUGF0aHMgZnJvbSBcInZpdGUtdHNjb25maWctcGF0aHNcIjtcblxuY29uc3QgeyBkZXBlbmRlbmNpZXMgPSB7fSwgcGVlckRlcGVuZGVuY2llcyA9IHt9IH0gPSBwa2cgYXMgYW55O1xuY29uc3QgbWFrZVJlZ2V4ID0gKGRlcCkgPT4gbmV3IFJlZ0V4cChgXiR7ZGVwfSgvLiopPyRgKTtcbmNvbnN0IGV4Y2x1ZGVBbGwgPSAob2JqKSA9PiBPYmplY3Qua2V5cyhvYmopLm1hcChtYWtlUmVnZXgpO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKCkgPT4ge1xuICByZXR1cm4ge1xuICAgIGJ1aWxkOiB7XG4gICAgICB0YXJnZXQ6IFwiZXMyMDIwXCIsXG4gICAgICBsaWI6IHtcbiAgICAgICAgZW50cnk6IFwiLi9zcmMvaW5kZXgudHNcIixcbiAgICAgICAgZm9ybWF0czogW1wiZXNcIiwgXCJjanNcIl0sXG4gICAgICAgIGZpbGVOYW1lOiAoZm9ybWF0KSA9PiBgaW5kZXgucXdpay4ke2Zvcm1hdCA9PT0gXCJlc1wiID8gXCJtanNcIiA6IFwiY2pzXCJ9YCxcbiAgICAgIH0sXG4gICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgIC8vIGV4dGVybmFsaXplIGRlcHMgdGhhdCBzaG91bGRuJ3QgYmUgYnVuZGxlZCBpbnRvIHRoZSBsaWJyYXJ5XG4gICAgICAgIGV4dGVybmFsOiBbXG4gICAgICAgICAgL15ub2RlOi4qLyxcbiAgICAgICAgICAuLi5leGNsdWRlQWxsKGRlcGVuZGVuY2llcyksXG4gICAgICAgICAgLi4uZXhjbHVkZUFsbChwZWVyRGVwZW5kZW5jaWVzKSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBwbHVnaW5zOiBbcXdpa1ZpdGUoKSwgdHNjb25maWdQYXRocygpXSxcbiAgfTtcbn0pO1xuIiwgIntcbiAgXCJuYW1lXCI6IFwicXdpay1saWJyYXJ5LW5hbWVcIixcbiAgXCJkZXNjcmlwdGlvblwiOiBcIkNyZWF0ZSBhIHJldXNhYmxlIFF3aWsgY29tcG9uZW50IGxpYnJhcnlcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiMC4wLjFcIixcbiAgXCJwcml2YXRlXCI6IGZhbHNlLFxuICBcIm1haW5cIjogXCIuL2xpYi9pbmRleC5xd2lrLm1qc1wiLFxuICBcInF3aWtcIjogXCIuL2xpYi9pbmRleC5xd2lrLm1qc1wiLFxuICBcInR5cGVzXCI6IFwiLi9saWItdHlwZXMvaW5kZXguZC50c1wiLFxuICBcInR5cGVcIjogXCJtb2R1bGVcIixcbiAgXCJleHBvcnRzXCI6IHtcbiAgICBcIi5cIjoge1xuICAgICAgXCJpbXBvcnRcIjogXCIuL2xpYi9pbmRleC5xd2lrLm1qc1wiLFxuICAgICAgXCJyZXF1aXJlXCI6IFwiLi9saWIvaW5kZXgucXdpay5janNcIixcbiAgICAgIFwidHlwZXNcIjogXCIuL2xpYi10eXBlcy9pbmRleC5kLnRzXCJcbiAgICB9XG4gIH0sXG4gIFwiZmlsZXNcIjogW1xuICAgIFwibGliXCIsXG4gICAgXCJsaWItdHlwZXNcIlxuICBdLFxuICBcInNjcmlwdHNcIjoge1xuICAgIFwiYnVpbGRcIjogXCJxd2lrIGJ1aWxkXCIsXG4gICAgXCJidWlsZC5saWJcIjogXCJ2aXRlIGJ1aWxkIC0tbW9kZSBsaWJcIixcbiAgICBcImJ1aWxkLnR5cGVzXCI6IFwidHNjIC0tZW1pdERlY2xhcmF0aW9uT25seVwiLFxuICAgIFwiZGV2XCI6IFwidml0ZSAtLW1vZGUgc3NyXCIsXG4gICAgXCJkZXYuZGVidWdcIjogXCJub2RlIC0taW5zcGVjdC1icmsgLi9ub2RlX21vZHVsZXMvdml0ZS9iaW4vdml0ZS5qcyAtLW1vZGUgc3NyIC0tZm9yY2VcIixcbiAgICBcImZtdFwiOiBcInByZXR0aWVyIC0td3JpdGUgLlwiLFxuICAgIFwiZm10LmNoZWNrXCI6IFwicHJldHRpZXIgLS1jaGVjayAuXCIsXG4gICAgXCJsaW50XCI6IFwiZXNsaW50IFxcXCJzcmMvKiovKi50cypcXFwiXCIsXG4gICAgXCJ0ZXN0XCI6IFwiZWNobyBcXFwiTm8gdGVzdCBzcGVjaWZpZWRcXFwiICYmIGV4aXQgMFwiLFxuICAgIFwic3RhcnRcIjogXCJ2aXRlIC0tb3BlbiAtLW1vZGUgc3NyXCIsXG4gICAgXCJxd2lrXCI6IFwicXdpa1wiLFxuICAgIFwicmVsZWFzZVwiOiBcIm5wXCJcbiAgfSxcbiAgXCJkZXZEZXBlbmRlbmNpZXNcIjoge1xuICAgIFwiQGJ1aWxkZXIuaW8vcXdpa1wiOiBcImxhdGVzdFwiLFxuICAgIFwiQHR5cGVzL2VzbGludFwiOiBcImxhdGVzdFwiLFxuICAgIFwiQHR5cGVzL25vZGVcIjogXCJsYXRlc3RcIixcbiAgICBcIkB0eXBlc2NyaXB0LWVzbGludC9lc2xpbnQtcGx1Z2luXCI6IFwibGF0ZXN0XCIsXG4gICAgXCJAdHlwZXNjcmlwdC1lc2xpbnQvcGFyc2VyXCI6IFwibGF0ZXN0XCIsXG4gICAgXCJlc2xpbnRcIjogXCJsYXRlc3RcIixcbiAgICBcImVzbGludC1wbHVnaW4tcXdpa1wiOiBcImxhdGVzdFwiLFxuICAgIFwibnBcIjogXCJeOC4wLjRcIixcbiAgICBcInByZXR0aWVyXCI6IFwibGF0ZXN0XCIsXG4gICAgXCJ0eXBlc2NyaXB0XCI6IFwibGF0ZXN0XCIsXG4gICAgXCJ1bmRpY2lcIjogXCJsYXRlc3RcIixcbiAgICBcInZpdGVcIjogXCJeNC41LjJcIixcbiAgICBcInZpdGUtdHNjb25maWctcGF0aHNcIjogXCJeNC4yLjFcIlxuICB9LFxuICBcIl9fcXdpa19fXCI6IHtcbiAgICBcImRpc3BsYXlOYW1lXCI6IFwiQ29tcG9uZW50IGxpYnJhcnkgKFF3aWspXCIsXG4gICAgXCJwcmlvcml0eVwiOiAtMSxcbiAgICBcImRvY3NcIjogW1xuICAgICAgXCJodHRwczovL3F3aWsuZGV2L2RvY3MvZ2V0dGluZy1zdGFydGVkL1wiXG4gICAgXVxuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlXLFNBQVMsb0JBQW9COzs7QUNBdFk7QUFBQSxFQUNFLE1BQVE7QUFBQSxFQUNSLGFBQWU7QUFBQSxFQUNmLFNBQVc7QUFBQSxFQUNYLFNBQVc7QUFBQSxFQUNYLE1BQVE7QUFBQSxFQUNSLE1BQVE7QUFBQSxFQUNSLE9BQVM7QUFBQSxFQUNULE1BQVE7QUFBQSxFQUNSLFNBQVc7QUFBQSxJQUNULEtBQUs7QUFBQSxNQUNILFFBQVU7QUFBQSxNQUNWLFNBQVc7QUFBQSxNQUNYLE9BQVM7QUFBQSxJQUNYO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBUztBQUFBLElBQ1A7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0EsU0FBVztBQUFBLElBQ1QsT0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsZUFBZTtBQUFBLElBQ2YsS0FBTztBQUFBLElBQ1AsYUFBYTtBQUFBLElBQ2IsS0FBTztBQUFBLElBQ1AsYUFBYTtBQUFBLElBQ2IsTUFBUTtBQUFBLElBQ1IsTUFBUTtBQUFBLElBQ1IsT0FBUztBQUFBLElBQ1QsTUFBUTtBQUFBLElBQ1IsU0FBVztBQUFBLEVBQ2I7QUFBQSxFQUNBLGlCQUFtQjtBQUFBLElBQ2pCLG9CQUFvQjtBQUFBLElBQ3BCLGlCQUFpQjtBQUFBLElBQ2pCLGVBQWU7QUFBQSxJQUNmLG9DQUFvQztBQUFBLElBQ3BDLDZCQUE2QjtBQUFBLElBQzdCLFFBQVU7QUFBQSxJQUNWLHNCQUFzQjtBQUFBLElBQ3RCLElBQU07QUFBQSxJQUNOLFVBQVk7QUFBQSxJQUNaLFlBQWM7QUFBQSxJQUNkLFFBQVU7QUFBQSxJQUNWLE1BQVE7QUFBQSxJQUNSLHVCQUF1QjtBQUFBLEVBQ3pCO0FBQUEsRUFDQSxVQUFZO0FBQUEsSUFDVixhQUFlO0FBQUEsSUFDZixVQUFZO0FBQUEsSUFDWixNQUFRO0FBQUEsTUFDTjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7OztBRHREQSxTQUFTLGdCQUFnQjtBQUN6QixPQUFPLG1CQUFtQjtBQUUxQixJQUFNLEVBQUUsZUFBZSxDQUFDLEdBQUcsbUJBQW1CLENBQUMsRUFBRSxJQUFJO0FBQ3JELElBQU0sWUFBWSxDQUFDLFFBQVEsSUFBSSxPQUFPLElBQUksR0FBRyxTQUFTO0FBQ3RELElBQU0sYUFBYSxDQUFDLFFBQVEsT0FBTyxLQUFLLEdBQUcsRUFBRSxJQUFJLFNBQVM7QUFFMUQsSUFBTyxzQkFBUSxhQUFhLE1BQU07QUFDaEMsU0FBTztBQUFBLElBQ0wsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsS0FBSztBQUFBLFFBQ0gsT0FBTztBQUFBLFFBQ1AsU0FBUyxDQUFDLE1BQU0sS0FBSztBQUFBLFFBQ3JCLFVBQVUsQ0FBQyxXQUFXLGNBQWMsV0FBVyxPQUFPLFFBQVEsS0FBSztBQUFBLE1BQ3JFO0FBQUEsTUFDQSxlQUFlO0FBQUE7QUFBQSxRQUViLFVBQVU7QUFBQSxVQUNSO0FBQUEsVUFDQSxHQUFHLFdBQVcsWUFBWTtBQUFBLFVBQzFCLEdBQUcsV0FBVyxnQkFBZ0I7QUFBQSxRQUNoQztBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsSUFDQSxTQUFTLENBQUMsU0FBUyxHQUFHLGNBQWMsQ0FBQztBQUFBLEVBQ3ZDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
