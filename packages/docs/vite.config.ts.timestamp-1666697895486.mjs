// vite.config.ts
import { defineConfig } from 'file:///Users/manualmeida/repos/builderio/qwik/node_modules/vite/dist/node/index.js';
import { qwikVite } from 'file:///Users/manualmeida/repos/builderio/qwik/packages/qwik/dist/optimizer.mjs';
import { resolve } from 'node:path';
import { qwikCity } from 'file:///Users/manualmeida/repos/builderio/qwik/packages/qwik-city/lib/vite/index.cjs';
import { partytownVite } from 'file:///Users/manualmeida/repos/builderio/qwik/node_modules/@builder.io/partytown/utils/index.cjs';

// vite.repl-apps.ts
import { join, basename } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
function playgroundData(routesDir) {
  const playgroundAppDir = join(routesDir, 'playground', 'app');
  return {
    name: 'playgroundData',
    resolveId(id) {
      if (id === '@playground-data') {
        return id;
      }
    },
    async load(id) {
      if (basename(id) === '@playground-data') {
        const playgroundApp = {
          inputs: readdirSync(playgroundAppDir).map((fileName) => {
            const filePath = join(playgroundAppDir, fileName);
            const input = {
              path: `/${fileName}`,
              code: readFileSync(filePath, 'utf-8'),
            };
            return input;
          }),
        };
        return `const playgroundApp = ${JSON.stringify(
          playgroundApp
        )};export default playgroundApp;`;
      }
      return null;
    },
  };
}
function examplesData(routesDir) {
  const dir = join(routesDir, 'examples', 'apps');
  const menuPath = join(dir, 'examples-menu.json');
  const menuSrc = readFileSync(menuPath, 'utf-8');
  const loadExamplesData = (ctx) => {
    const sections = [];
    const dataSections = JSON.parse(menuSrc);
    ctx.addWatchFile(menuPath);
    for (const dataSection of dataSections) {
      const sectionDir = join(dir, dataSection.id);
      if (!existsSync(sectionDir)) {
        throw new Error(`Example section "${sectionDir}" doesn't exist`);
      }
      const s = statSync(sectionDir);
      if (!s.isDirectory()) {
        throw new Error(`Example section "${sectionDir}" is not a directory`);
      }
      const section = {
        ...dataSection,
        apps: [],
      };
      for (const app of dataSection.apps) {
        const appDir = join(sectionDir, app.id);
        if (!existsSync(appDir)) {
          throw new Error(`Example app "${appDir}" doesn't exist`);
        }
        const s2 = statSync(appDir);
        if (!s2.isDirectory()) {
          throw new Error(`Example app "${appDir}" is not a directory`);
        }
        const inputs = readdirSync(appDir)
          .map((fileName) => {
            const filePath = join(appDir, fileName);
            const s3 = statSync(filePath);
            if (s3.isFile()) {
              const input = {
                path: `/${fileName}`,
                code: readFileSync(filePath, 'utf-8'),
              };
              ctx.addWatchFile(filePath);
              return input;
            } else {
              return null;
            }
          })
          .filter((i) => i !== null);
        if (inputs.length === 0) {
          throw new Error(`Example "${appDir}" does not have any valid files.`);
        }
        if (!inputs.some((i) => i.path.endsWith('app.tsx'))) {
          throw new Error(
            `Example must have an "app.tsx" file, which wasn't found in "${appDir}".`
          );
        }
        section.apps.push({
          ...app,
          id: `${section.id}/${app.id}`,
          inputs,
        });
      }
      if (section.apps.length > 0) {
        sections.push(section);
      } else {
        throw new Error(`Example section "${section.id}" has no apps`);
      }
    }
    return sections;
  };
  return {
    name: 'examplesData',
    resolveId(id) {
      if (id === '@examples-data') {
        return id;
      }
    },
    async load(id) {
      if (basename(id) === '@examples-data') {
        const data = loadExamplesData(this);
        return `const exampleSections = ${JSON.stringify(data)};export default exampleSections;`;
      }
      return null;
    },
  };
}
function tutorialData(routesDir) {
  const dir = join(routesDir, 'tutorial');
  const menuPath = join(dir, 'tutorial-menu.json');
  const menuSrc = readFileSync(menuPath, 'utf-8');
  const loadTutorialData = (ctx) => {
    const sections = [];
    const dataSections = JSON.parse(menuSrc);
    ctx.addWatchFile(menuPath);
    for (const dataSection of dataSections) {
      const sectionDir = join(dir, dataSection.id);
      if (!existsSync(sectionDir)) {
        throw new Error(`Tutorial section "${sectionDir}" doesn't exist`);
      }
      const s = statSync(sectionDir);
      if (!s.isDirectory()) {
        throw new Error(`Tutorial section "${sectionDir}" is not a directory`);
      }
      const section = {
        ...dataSection,
        apps: [],
      };
      for (const app of dataSection.apps) {
        const appDir = join(sectionDir, app.id);
        if (!existsSync(appDir)) {
          throw new Error(`Tutorial app "${appDir}" doesn't exist`);
        }
        const s2 = statSync(appDir);
        if (!s2.isDirectory()) {
          throw new Error(`Tutorial app "${appDir}" is not a directory`);
        }
        const readAppInputs = (appType) => {
          const appTypeDir = join(appDir, appType);
          if (!existsSync(appTypeDir)) {
            throw new Error(`Tutorial "${appType}" dir "${appTypeDir}" doesn't exist`);
          }
          const s3 = statSync(sectionDir);
          if (!s3.isDirectory()) {
            throw new Error(`Tutorial "${appType}" dir "${appTypeDir}" is not a directory`);
          }
          const inputs = readdirSync(appTypeDir)
            .map((fileName) => {
              const filePath = join(appTypeDir, fileName);
              const s4 = statSync(filePath);
              if (s4.isFile()) {
                const input = {
                  path: `/${fileName}`,
                  code: readFileSync(filePath, 'utf-8'),
                };
                ctx.addWatchFile(filePath);
                return input;
              } else {
                return null;
              }
            })
            .filter((i) => i !== null);
          if (inputs.length === 0) {
            throw new Error(
              `Tutorial "${appType}" dir "${appTypeDir}" does not have any valid files.`
            );
          }
          if (!inputs.some((i) => i.path.endsWith('app.tsx'))) {
            throw new Error(
              `Tutorials must have an "app.tsx" file, which wasn't found in "${appType}" dir "${appTypeDir}".`
            );
          }
          return inputs;
        };
        section.apps.push({
          ...app,
          id: `${section.id}/${app.id}`,
          problemInputs: readAppInputs('problem'),
          solutionInputs: readAppInputs('solution'),
        });
      }
      if (section.apps.length > 0) {
        sections.push(section);
      } else {
        throw new Error(`Tutorial section "${section.id}" has no apps`);
      }
    }
    return sections;
  };
  return {
    name: 'tutorialData',
    resolveId(id) {
      if (id === '@tutorial-data') {
        return id;
      }
    },
    async load(id) {
      if (basename(id) === '@tutorial-data') {
        const data = loadTutorialData(this);
        return `const tutorialSections = ${JSON.stringify(data)};export default tutorialSections;`;
      }
      return null;
    },
  };
}

// vite.config.ts
var vite_config_default = defineConfig(() => {
  const routesDir = resolve('src', 'routes');
  return {
    optimizeDeps: {
      force: true,
    },
    ssr: {
      noExternal: [
        '@algolia/autocomplete-core',
        '@algolia/autocomplete-core/dist/esm/resolve.js',
        '@algolia/autocomplete-shared',
      ],
    },
    plugins: [
      qwikCity({
        trailingSlash: true,
      }),
      qwikVite({
        debug: true,
        entryStrategy: {
          type: 'smart',
          manual: {
            ...algoliaSearch,
            ...leftMenu,
            ...rightMenu,
            ...repl,
          },
        },
      }),
      partytownVite({
        dest: resolve('dist', '~partytown'),
      }),
      examplesData(routesDir),
      playgroundData(routesDir),
      tutorialData(routesDir),
    ],
    server: {
      port: 3e3,
    },
  };
});
var algoliaSearch = {
  I5CyQjO9FjQ: 'algolia',
  NsnidK2eXPg: 'algolia',
  kDw0latGeM0: 'algolia',
  '9dP8xDD36tk': 'algolia',
  '7YcOLMha9lM': 'algolia',
  Ly5oFWTkofs: 'algolia',
  fTU5LQ1VhcU: 'algolia',
  X3ZkFa9P7Dc: 'algolia',
  cuQ7Gs7HxZk: 'algolia',
  FwHw10iT91I: 'algolia',
  '8CcNvxhg0Nk': 'algolia',
  MuhA2XBHGV8: 'algolia',
  kySyEi4IbWw: 'algolia',
  J3Nim3Y9sio: 'algolia',
  aWt0AqHIkGQ: 'algolia',
  JJa1OmmlJI0: 'algolia',
  uCl5Lf0Typ8: 'algolia',
};
var leftMenu = {
  '80OgQ5lcFr4': 'leftmenu',
  w5MYBhIX0cA: 'leftmenu',
  pEMEmtwhXxM: 'leftmenu',
};
var rightMenu = {
  QavemLlxiyA: 'rightmenu',
  w5MYBhIX0cA: 'rightmenu',
};
var repl = {
  '9hTSF08oC0c': 'repl',
  b0zG7SjJ0mY: 'repl',
  '2pen08LKHIc': 'repl',
  '00yssl5ZdQ0': 'repl',
  dGMbXdytWYw: 'repl',
  '3LhofjAcE3o': 'repl',
  Vf8gUl5vM9Q: 'repl',
  iw211Du0bw8: 'repl',
  znnkb13Pb1Q: 'repl',
  JNuA4OQTkdc: 'repl',
  MbH3hL9RTzs: 'repl',
  vkZre20bmo0: 'repl',
  '599ANF7zBGE': 'repl',
};
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAidml0ZS5yZXBsLWFwcHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbWFudWFsbWVpZGEvcmVwb3MvYnVpbGRlcmlvL3F3aWsvcGFja2FnZXMvZG9jc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL21hbnVhbG1laWRhL3JlcG9zL2J1aWxkZXJpby9xd2lrL3BhY2thZ2VzL2RvY3Mvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL21hbnVhbG1laWRhL3JlcG9zL2J1aWxkZXJpby9xd2lrL3BhY2thZ2VzL2RvY3Mvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCB7IHF3aWtWaXRlIH0gZnJvbSAnQGJ1aWxkZXIuaW8vcXdpay9vcHRpbWl6ZXInO1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ25vZGU6cGF0aCc7XG5pbXBvcnQgeyBxd2lrQ2l0eSB9IGZyb20gJ0BidWlsZGVyLmlvL3F3aWstY2l0eS92aXRlJztcbmltcG9ydCB7IHBhcnR5dG93blZpdGUgfSBmcm9tICdAYnVpbGRlci5pby9wYXJ0eXRvd24vdXRpbHMnO1xuaW1wb3J0IHsgZXhhbXBsZXNEYXRhLCBwbGF5Z3JvdW5kRGF0YSwgdHV0b3JpYWxEYXRhIH0gZnJvbSAnLi92aXRlLnJlcGwtYXBwcyc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoKSA9PiB7XG4gIGNvbnN0IHJvdXRlc0RpciA9IHJlc29sdmUoJ3NyYycsICdyb3V0ZXMnKTtcblxuICByZXR1cm4ge1xuICAgIG9wdGltaXplRGVwczoge1xuICAgICAgZm9yY2U6IHRydWUsXG4gICAgfSxcbiAgICBzc3I6IHtcbiAgICAgIG5vRXh0ZXJuYWw6IFtcbiAgICAgICAgJ0BhbGdvbGlhL2F1dG9jb21wbGV0ZS1jb3JlJyxcbiAgICAgICAgJ0BhbGdvbGlhL2F1dG9jb21wbGV0ZS1jb3JlL2Rpc3QvZXNtL3Jlc29sdmUuanMnLFxuICAgICAgICAnQGFsZ29saWEvYXV0b2NvbXBsZXRlLXNoYXJlZCcsXG4gICAgICBdXG4gICAgfSxcbiAgICBwbHVnaW5zOiBbXG4gICAgICBxd2lrQ2l0eSh7XG4gICAgICAgIHRyYWlsaW5nU2xhc2g6IHRydWUsXG4gICAgICB9KSxcbiAgICAgIHF3aWtWaXRlKHtcbiAgICAgICAgZGVidWc6IHRydWUsXG4gICAgICAgIGVudHJ5U3RyYXRlZ3k6IHtcbiAgICAgICAgICB0eXBlOiAnc21hcnQnLFxuICAgICAgICAgIG1hbnVhbDoge1xuICAgICAgICAgICAgLi4uYWxnb2xpYVNlYXJjaCxcbiAgICAgICAgICAgIC4uLmxlZnRNZW51LFxuICAgICAgICAgICAgLi4ucmlnaHRNZW51LFxuICAgICAgICAgICAgLi4ucmVwbCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBwYXJ0eXRvd25WaXRlKHtcbiAgICAgICAgZGVzdDogcmVzb2x2ZSgnZGlzdCcsICd+cGFydHl0b3duJyksXG4gICAgICB9KSxcbiAgICAgIGV4YW1wbGVzRGF0YShyb3V0ZXNEaXIpLFxuICAgICAgcGxheWdyb3VuZERhdGEocm91dGVzRGlyKSxcbiAgICAgIHR1dG9yaWFsRGF0YShyb3V0ZXNEaXIpLFxuICAgIF0sXG4gICAgc2VydmVyOiB7XG4gICAgICBwb3J0OiAzMDAwLFxuICAgIH0sXG4gIH07XG59KTtcblxuY29uc3QgYWxnb2xpYVNlYXJjaCA9IHtcbiAgSTVDeVFqTzlGalE6ICdhbGdvbGlhJyxcbiAgTnNuaWRLMmVYUGc6ICdhbGdvbGlhJyxcbiAga0R3MGxhdEdlTTA6ICdhbGdvbGlhJyxcbiAgJzlkUDh4REQzNnRrJzogJ2FsZ29saWEnLFxuICAnN1ljT0xNaGE5bE0nOiAnYWxnb2xpYScsXG4gIEx5NW9GV1Rrb2ZzOiAnYWxnb2xpYScsXG4gIGZUVTVMUTFWaGNVOiAnYWxnb2xpYScsXG4gIFgzWmtGYTlQN0RjOiAnYWxnb2xpYScsXG4gIGN1UTdHczdIeFprOiAnYWxnb2xpYScsXG4gIEZ3SHcxMGlUOTFJOiAnYWxnb2xpYScsXG4gICc4Q2NOdnhoZzBOayc6ICdhbGdvbGlhJyxcbiAgTXVoQTJYQkhHVjg6ICdhbGdvbGlhJyxcbiAga3lTeUVpNEliV3c6ICdhbGdvbGlhJyxcbiAgSjNOaW0zWTlzaW86ICdhbGdvbGlhJyxcbiAgYVd0MEFxSElrR1E6ICdhbGdvbGlhJyxcbiAgSkphMU9tbWxKSTA6ICdhbGdvbGlhJyxcbiAgdUNsNUxmMFR5cDg6ICdhbGdvbGlhJyxcbn07XG5cbmNvbnN0IGxlZnRNZW51ID0ge1xuICAnODBPZ1E1bGNGcjQnOiAnbGVmdG1lbnUnLFxuICB3NU1ZQmhJWDBjQTogJ2xlZnRtZW51JyxcbiAgcEVNRW10d2hYeE06ICdsZWZ0bWVudScsXG59O1xuXG5jb25zdCByaWdodE1lbnUgPSB7XG4gIFFhdmVtTGx4aXlBOiAncmlnaHRtZW51JyxcbiAgdzVNWUJoSVgwY0E6ICdyaWdodG1lbnUnLFxufTtcblxuY29uc3QgcmVwbCA9IHtcbiAgJzloVFNGMDhvQzBjJzogJ3JlcGwnLFxuICBiMHpHN1NqSjBtWTogJ3JlcGwnLFxuICAnMnBlbjA4TEtISWMnOiAncmVwbCcsXG4gICcwMHlzc2w1WmRRMCc6ICdyZXBsJyxcbiAgZEdNYlhkeXRXWXc6ICdyZXBsJyxcbiAgJzNMaG9makFjRTNvJzogJ3JlcGwnLFxuICBWZjhnVWw1dk05UTogJ3JlcGwnLFxuICBpdzIxMUR1MGJ3ODogJ3JlcGwnLFxuICB6bm5rYjEzUGIxUTogJ3JlcGwnLFxuICBKTnVBNE9RVGtkYzogJ3JlcGwnLFxuICBNYkgzaEw5UlR6czogJ3JlcGwnLFxuICB2a1pyZTIwYm1vMDogJ3JlcGwnLFxuICAnNTk5QU5GN3pCR0UnOiAncmVwbCcsXG59O1xuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbWFudWFsbWVpZGEvcmVwb3MvYnVpbGRlcmlvL3F3aWsvcGFja2FnZXMvZG9jc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL21hbnVhbG1laWRhL3JlcG9zL2J1aWxkZXJpby9xd2lrL3BhY2thZ2VzL2RvY3Mvdml0ZS5yZXBsLWFwcHMudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL21hbnVhbG1laWRhL3JlcG9zL2J1aWxkZXJpby9xd2lrL3BhY2thZ2VzL2RvY3Mvdml0ZS5yZXBsLWFwcHMudHNcIjtpbXBvcnQgdHlwZSB7IFBsdWdpbiB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHR5cGUgeyBUcmFuc2Zvcm1Nb2R1bGVJbnB1dCB9IGZyb20gJ0BidWlsZGVyLmlvL3F3aWsvb3B0aW1pemVyJztcbmltcG9ydCB7IGpvaW4sIGJhc2VuYW1lIH0gZnJvbSAnbm9kZTpwYXRoJztcbmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlYWRkaXJTeW5jLCByZWFkRmlsZVN5bmMsIHN0YXRTeW5jIH0gZnJvbSAnbm9kZTpmcyc7XG5pbXBvcnQgdHlwZSB7IEV4YW1wbGVTZWN0aW9uIH0gZnJvbSAnLi9zcmMvcm91dGVzL2V4YW1wbGVzL2FwcHMvZXhhbXBsZXMtZGF0YSc7XG5pbXBvcnQgdHlwZSB7IFBsYXlncm91bmRBcHAgfSBmcm9tICcuL3NyYy9yb3V0ZXMvcGxheWdyb3VuZC9wbGF5Z3JvdW5kLWRhdGEnO1xuaW1wb3J0IHR5cGUgeyBUdXRvcmlhbFNlY3Rpb24gfSBmcm9tICcuL3NyYy9yb3V0ZXMvdHV0b3JpYWwvdHV0b3JpYWwtZGF0YSc7XG5pbXBvcnQgdHlwZSB7IFBsdWdpbkNvbnRleHQgfSBmcm9tICdyb2xsdXAnO1xuaW1wb3J0IHR5cGUgeyBSZXBsTW9kdWxlSW5wdXQgfSBmcm9tICcuL3NyYy9yZXBsL3R5cGVzJztcblxuZXhwb3J0IGZ1bmN0aW9uIHBsYXlncm91bmREYXRhKHJvdXRlc0Rpcjogc3RyaW5nKTogUGx1Z2luIHtcbiAgY29uc3QgcGxheWdyb3VuZEFwcERpciA9IGpvaW4ocm91dGVzRGlyLCAncGxheWdyb3VuZCcsICdhcHAnKTtcblxuICByZXR1cm4ge1xuICAgIG5hbWU6ICdwbGF5Z3JvdW5kRGF0YScsXG5cbiAgICByZXNvbHZlSWQoaWQpIHtcbiAgICAgIGlmIChpZCA9PT0gJ0BwbGF5Z3JvdW5kLWRhdGEnKSB7XG4gICAgICAgIHJldHVybiBpZDtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgYXN5bmMgbG9hZChpZCkge1xuICAgICAgaWYgKGJhc2VuYW1lKGlkKSA9PT0gJ0BwbGF5Z3JvdW5kLWRhdGEnKSB7XG4gICAgICAgIGNvbnN0IHBsYXlncm91bmRBcHA6IFBsYXlncm91bmRBcHAgPSB7XG4gICAgICAgICAgaW5wdXRzOiByZWFkZGlyU3luYyhwbGF5Z3JvdW5kQXBwRGlyKS5tYXAoKGZpbGVOYW1lKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGpvaW4ocGxheWdyb3VuZEFwcERpciwgZmlsZU5hbWUpO1xuICAgICAgICAgICAgY29uc3QgaW5wdXQ6IFRyYW5zZm9ybU1vZHVsZUlucHV0ID0ge1xuICAgICAgICAgICAgICBwYXRoOiBgLyR7ZmlsZU5hbWV9YCxcbiAgICAgICAgICAgICAgY29kZTogcmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmLTgnKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgICAgICAgfSksXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBgY29uc3QgcGxheWdyb3VuZEFwcCA9ICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgcGxheWdyb3VuZEFwcFxuICAgICAgICApfTtleHBvcnQgZGVmYXVsdCBwbGF5Z3JvdW5kQXBwO2A7XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhhbXBsZXNEYXRhKHJvdXRlc0Rpcjogc3RyaW5nKTogUGx1Z2luIHtcbiAgY29uc3QgZGlyID0gam9pbihyb3V0ZXNEaXIsICdleGFtcGxlcycsICdhcHBzJyk7XG4gIGNvbnN0IG1lbnVQYXRoID0gam9pbihkaXIsICdleGFtcGxlcy1tZW51Lmpzb24nKTtcbiAgY29uc3QgbWVudVNyYyA9IHJlYWRGaWxlU3luYyhtZW51UGF0aCwgJ3V0Zi04Jyk7XG5cbiAgY29uc3QgbG9hZEV4YW1wbGVzRGF0YSA9IChjdHg6IFBsdWdpbkNvbnRleHQpID0+IHtcbiAgICBjb25zdCBzZWN0aW9uczogRXhhbXBsZVNlY3Rpb25bXSA9IFtdO1xuICAgIGNvbnN0IGRhdGFTZWN0aW9uczogRXhhbXBsZVNlY3Rpb25bXSA9IEpTT04ucGFyc2UobWVudVNyYyk7XG4gICAgY3R4LmFkZFdhdGNoRmlsZShtZW51UGF0aCk7XG5cbiAgICBmb3IgKGNvbnN0IGRhdGFTZWN0aW9uIG9mIGRhdGFTZWN0aW9ucykge1xuICAgICAgY29uc3Qgc2VjdGlvbkRpciA9IGpvaW4oZGlyLCBkYXRhU2VjdGlvbi5pZCk7XG5cbiAgICAgIGlmICghZXhpc3RzU3luYyhzZWN0aW9uRGlyKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4YW1wbGUgc2VjdGlvbiBcIiR7c2VjdGlvbkRpcn1cIiBkb2Vzbid0IGV4aXN0YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHMgPSBzdGF0U3luYyhzZWN0aW9uRGlyKTtcbiAgICAgIGlmICghcy5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhhbXBsZSBzZWN0aW9uIFwiJHtzZWN0aW9uRGlyfVwiIGlzIG5vdCBhIGRpcmVjdG9yeWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzZWN0aW9uOiBFeGFtcGxlU2VjdGlvbiA9IHtcbiAgICAgICAgLi4uZGF0YVNlY3Rpb24sXG4gICAgICAgIGFwcHM6IFtdLFxuICAgICAgfTtcblxuICAgICAgZm9yIChjb25zdCBhcHAgb2YgZGF0YVNlY3Rpb24uYXBwcykge1xuICAgICAgICBjb25zdCBhcHBEaXIgPSBqb2luKHNlY3Rpb25EaXIsIGFwcC5pZCk7XG4gICAgICAgIGlmICghZXhpc3RzU3luYyhhcHBEaXIpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeGFtcGxlIGFwcCBcIiR7YXBwRGlyfVwiIGRvZXNuJ3QgZXhpc3RgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHMgPSBzdGF0U3luYyhhcHBEaXIpO1xuICAgICAgICBpZiAoIXMuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhhbXBsZSBhcHAgXCIke2FwcERpcn1cIiBpcyBub3QgYSBkaXJlY3RvcnlgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlucHV0czogUmVwbE1vZHVsZUlucHV0W10gPSByZWFkZGlyU3luYyhhcHBEaXIpXG4gICAgICAgICAgLm1hcCgoZmlsZU5hbWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gam9pbihhcHBEaXIsIGZpbGVOYW1lKTtcbiAgICAgICAgICAgIGNvbnN0IHMgPSBzdGF0U3luYyhmaWxlUGF0aCk7XG4gICAgICAgICAgICBpZiAocy5pc0ZpbGUoKSkge1xuICAgICAgICAgICAgICBjb25zdCBpbnB1dDogUmVwbE1vZHVsZUlucHV0ID0ge1xuICAgICAgICAgICAgICAgIHBhdGg6IGAvJHtmaWxlTmFtZX1gLFxuICAgICAgICAgICAgICAgIGNvZGU6IHJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0Zi04JyksXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIGN0eC5hZGRXYXRjaEZpbGUoZmlsZVBhdGgpO1xuICAgICAgICAgICAgICByZXR1cm4gaW5wdXQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICAgIC5maWx0ZXIoKGkpID0+IGkgIT09IG51bGwpIGFzIGFueTtcblxuICAgICAgICBpZiAoaW5wdXRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhhbXBsZSBcIiR7YXBwRGlyfVwiIGRvZXMgbm90IGhhdmUgYW55IHZhbGlkIGZpbGVzLmApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghaW5wdXRzLnNvbWUoKGkpID0+IGkucGF0aC5lbmRzV2l0aCgnYXBwLnRzeCcpKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBFeGFtcGxlIG11c3QgaGF2ZSBhbiBcImFwcC50c3hcIiBmaWxlLCB3aGljaCB3YXNuJ3QgZm91bmQgaW4gXCIke2FwcERpcn1cIi5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlY3Rpb24uYXBwcy5wdXNoKHtcbiAgICAgICAgICAuLi5hcHAsXG4gICAgICAgICAgaWQ6IGAke3NlY3Rpb24uaWR9LyR7YXBwLmlkfWAsXG4gICAgICAgICAgaW5wdXRzLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHNlY3Rpb24uYXBwcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHNlY3Rpb25zLnB1c2goc2VjdGlvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4YW1wbGUgc2VjdGlvbiBcIiR7c2VjdGlvbi5pZH1cIiBoYXMgbm8gYXBwc2ApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzZWN0aW9ucztcbiAgfTtcblxuICByZXR1cm4ge1xuICAgIG5hbWU6ICdleGFtcGxlc0RhdGEnLFxuXG4gICAgcmVzb2x2ZUlkKGlkKSB7XG4gICAgICBpZiAoaWQgPT09ICdAZXhhbXBsZXMtZGF0YScpIHtcbiAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBsb2FkKGlkKSB7XG4gICAgICBpZiAoYmFzZW5hbWUoaWQpID09PSAnQGV4YW1wbGVzLWRhdGEnKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBsb2FkRXhhbXBsZXNEYXRhKHRoaXMpO1xuICAgICAgICByZXR1cm4gYGNvbnN0IGV4YW1wbGVTZWN0aW9ucyA9ICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9O2V4cG9ydCBkZWZhdWx0IGV4YW1wbGVTZWN0aW9ucztgO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHR1dG9yaWFsRGF0YShyb3V0ZXNEaXI6IHN0cmluZyk6IFBsdWdpbiB7XG4gIGNvbnN0IGRpciA9IGpvaW4ocm91dGVzRGlyLCAndHV0b3JpYWwnKTtcbiAgY29uc3QgbWVudVBhdGggPSBqb2luKGRpciwgJ3R1dG9yaWFsLW1lbnUuanNvbicpO1xuICBjb25zdCBtZW51U3JjID0gcmVhZEZpbGVTeW5jKG1lbnVQYXRoLCAndXRmLTgnKTtcblxuICBjb25zdCBsb2FkVHV0b3JpYWxEYXRhID0gKGN0eDogUGx1Z2luQ29udGV4dCkgPT4ge1xuICAgIGNvbnN0IHNlY3Rpb25zOiBUdXRvcmlhbFNlY3Rpb25bXSA9IFtdO1xuICAgIGNvbnN0IGRhdGFTZWN0aW9uczogVHV0b3JpYWxTZWN0aW9uW10gPSBKU09OLnBhcnNlKG1lbnVTcmMpO1xuICAgIGN0eC5hZGRXYXRjaEZpbGUobWVudVBhdGgpO1xuXG4gICAgZm9yIChjb25zdCBkYXRhU2VjdGlvbiBvZiBkYXRhU2VjdGlvbnMpIHtcbiAgICAgIGNvbnN0IHNlY3Rpb25EaXIgPSBqb2luKGRpciwgZGF0YVNlY3Rpb24uaWQpO1xuXG4gICAgICBpZiAoIWV4aXN0c1N5bmMoc2VjdGlvbkRpcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUdXRvcmlhbCBzZWN0aW9uIFwiJHtzZWN0aW9uRGlyfVwiIGRvZXNuJ3QgZXhpc3RgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcyA9IHN0YXRTeW5jKHNlY3Rpb25EaXIpO1xuICAgICAgaWYgKCFzLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUdXRvcmlhbCBzZWN0aW9uIFwiJHtzZWN0aW9uRGlyfVwiIGlzIG5vdCBhIGRpcmVjdG9yeWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzZWN0aW9uOiBUdXRvcmlhbFNlY3Rpb24gPSB7XG4gICAgICAgIC4uLmRhdGFTZWN0aW9uLFxuICAgICAgICBhcHBzOiBbXSxcbiAgICAgIH07XG5cbiAgICAgIGZvciAoY29uc3QgYXBwIG9mIGRhdGFTZWN0aW9uLmFwcHMpIHtcbiAgICAgICAgY29uc3QgYXBwRGlyID0gam9pbihzZWN0aW9uRGlyLCBhcHAuaWQpO1xuICAgICAgICBpZiAoIWV4aXN0c1N5bmMoYXBwRGlyKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVHV0b3JpYWwgYXBwIFwiJHthcHBEaXJ9XCIgZG9lc24ndCBleGlzdGApO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcyA9IHN0YXRTeW5jKGFwcERpcik7XG4gICAgICAgIGlmICghcy5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUdXRvcmlhbCBhcHAgXCIke2FwcERpcn1cIiBpcyBub3QgYSBkaXJlY3RvcnlgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlYWRBcHBJbnB1dHMgPSAoYXBwVHlwZTogJ3Byb2JsZW0nIHwgJ3NvbHV0aW9uJykgPT4ge1xuICAgICAgICAgIGNvbnN0IGFwcFR5cGVEaXIgPSBqb2luKGFwcERpciwgYXBwVHlwZSk7XG5cbiAgICAgICAgICBpZiAoIWV4aXN0c1N5bmMoYXBwVHlwZURpcikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVHV0b3JpYWwgXCIke2FwcFR5cGV9XCIgZGlyIFwiJHthcHBUeXBlRGlyfVwiIGRvZXNuJ3QgZXhpc3RgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBzID0gc3RhdFN5bmMoc2VjdGlvbkRpcik7XG4gICAgICAgICAgaWYgKCFzLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVHV0b3JpYWwgXCIke2FwcFR5cGV9XCIgZGlyIFwiJHthcHBUeXBlRGlyfVwiIGlzIG5vdCBhIGRpcmVjdG9yeWApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGlucHV0czogUmVwbE1vZHVsZUlucHV0W10gPSByZWFkZGlyU3luYyhhcHBUeXBlRGlyKVxuICAgICAgICAgICAgLm1hcCgoZmlsZU5hbWUpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBqb2luKGFwcFR5cGVEaXIsIGZpbGVOYW1lKTtcbiAgICAgICAgICAgICAgY29uc3QgcyA9IHN0YXRTeW5jKGZpbGVQYXRoKTtcbiAgICAgICAgICAgICAgaWYgKHMuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbnB1dDogUmVwbE1vZHVsZUlucHV0ID0ge1xuICAgICAgICAgICAgICAgICAgcGF0aDogYC8ke2ZpbGVOYW1lfWAsXG4gICAgICAgICAgICAgICAgICBjb2RlOiByZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGYtOCcpLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgY3R4LmFkZFdhdGNoRmlsZShmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbHRlcigoaSkgPT4gaSAhPT0gbnVsbCkgYXMgYW55O1xuXG4gICAgICAgICAgaWYgKGlucHV0cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgYFR1dG9yaWFsIFwiJHthcHBUeXBlfVwiIGRpciBcIiR7YXBwVHlwZURpcn1cIiBkb2VzIG5vdCBoYXZlIGFueSB2YWxpZCBmaWxlcy5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWlucHV0cy5zb21lKChpKSA9PiBpLnBhdGguZW5kc1dpdGgoJ2FwcC50c3gnKSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgYFR1dG9yaWFscyBtdXN0IGhhdmUgYW4gXCJhcHAudHN4XCIgZmlsZSwgd2hpY2ggd2Fzbid0IGZvdW5kIGluIFwiJHthcHBUeXBlfVwiIGRpciBcIiR7YXBwVHlwZURpcn1cIi5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBpbnB1dHM7XG4gICAgICAgIH07XG5cbiAgICAgICAgc2VjdGlvbi5hcHBzLnB1c2goe1xuICAgICAgICAgIC4uLmFwcCxcbiAgICAgICAgICBpZDogYCR7c2VjdGlvbi5pZH0vJHthcHAuaWR9YCxcbiAgICAgICAgICBwcm9ibGVtSW5wdXRzOiByZWFkQXBwSW5wdXRzKCdwcm9ibGVtJyksXG4gICAgICAgICAgc29sdXRpb25JbnB1dHM6IHJlYWRBcHBJbnB1dHMoJ3NvbHV0aW9uJyksXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoc2VjdGlvbi5hcHBzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc2VjdGlvbnMucHVzaChzZWN0aW9uKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVHV0b3JpYWwgc2VjdGlvbiBcIiR7c2VjdGlvbi5pZH1cIiBoYXMgbm8gYXBwc2ApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBzZWN0aW9ucztcbiAgfTtcblxuICByZXR1cm4ge1xuICAgIG5hbWU6ICd0dXRvcmlhbERhdGEnLFxuXG4gICAgcmVzb2x2ZUlkKGlkKSB7XG4gICAgICBpZiAoaWQgPT09ICdAdHV0b3JpYWwtZGF0YScpIHtcbiAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBsb2FkKGlkKSB7XG4gICAgICBpZiAoYmFzZW5hbWUoaWQpID09PSAnQHR1dG9yaWFsLWRhdGEnKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBsb2FkVHV0b3JpYWxEYXRhKHRoaXMpO1xuICAgICAgICByZXR1cm4gYGNvbnN0IHR1dG9yaWFsU2VjdGlvbnMgPSAke0pTT04uc3RyaW5naWZ5KGRhdGEpfTtleHBvcnQgZGVmYXVsdCB0dXRvcmlhbFNlY3Rpb25zO2A7XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9LFxuICB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFpVixTQUFTLG9CQUFvQjtBQUM5VyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7OztBQ0Y5QixTQUFTLE1BQU0sZ0JBQWdCO0FBQy9CLFNBQVMsWUFBWSxhQUFhLGNBQWMsZ0JBQWdCO0FBT3pELFNBQVMsZUFBZSxXQUEyQjtBQUN4RCxRQUFNLG1CQUFtQixLQUFLLFdBQVcsY0FBYyxLQUFLO0FBRTVELFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUVOLFVBQVUsSUFBSTtBQUNaLFVBQUksT0FBTyxvQkFBb0I7QUFDN0IsZUFBTztBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBQUEsSUFFQSxNQUFNLEtBQUssSUFBSTtBQUNiLFVBQUksU0FBUyxFQUFFLE1BQU0sb0JBQW9CO0FBQ3ZDLGNBQU0sZ0JBQStCO0FBQUEsVUFDbkMsUUFBUSxZQUFZLGdCQUFnQixFQUFFLElBQUksQ0FBQyxhQUFhO0FBQ3RELGtCQUFNLFdBQVcsS0FBSyxrQkFBa0IsUUFBUTtBQUNoRCxrQkFBTSxRQUE4QjtBQUFBLGNBQ2xDLE1BQU0sSUFBSTtBQUFBLGNB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
