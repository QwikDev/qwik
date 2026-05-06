import type { TransformModuleInput } from '@qwik.dev/core/optimizer';
import MagicString from 'magic-string';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { PluginContext } from 'rollup';
import type { Plugin } from 'vite';
import type { ReplModuleInput } from './src/repl/types';
import type { ExampleSection } from './src/routes/examples/apps/examples-data';
import type { PlaygroundApp } from './src/routes/playground/playground-data';
import type { TutorialSection } from './src/routes/tutorial/tutorial-data';

export function playgroundData(routesDir: string): Plugin {
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
        const playgroundApp: PlaygroundApp = {
          inputs: readdirSync(playgroundAppDir).map((fileName) => {
            const filePath = join(playgroundAppDir, fileName);
            const input: TransformModuleInput = {
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

export function examplesData(routesDir: string): Plugin {
  const dir = join(routesDir, 'examples', 'apps');
  const menuPath = join(dir, 'examples-menu.json');
  const menuSrc = readFileSync(menuPath, 'utf-8');

  const loadExamplesData = (ctx: PluginContext) => {
    const sections: ExampleSection[] = [];
    const dataSections: ExampleSection[] = JSON.parse(menuSrc);
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

      const section: ExampleSection = {
        ...dataSection,
        apps: [],
      };

      for (const app of dataSection.apps) {
        const appDir = join(sectionDir, app.id);
        if (!existsSync(appDir)) {
          throw new Error(`Example app "${appDir}" doesn't exist`);
        }

        const s = statSync(appDir);
        if (!s.isDirectory()) {
          throw new Error(`Example app "${appDir}" is not a directory`);
        }

        const inputs: ReplModuleInput[] = readdirSync(appDir)
          .map((fileName) => {
            const filePath = join(appDir, fileName);
            const s = statSync(filePath);
            if (s.isFile()) {
              const input: ReplModuleInput = {
                path: `/${fileName}`,
                code: readFileSync(filePath, 'utf-8'),
              };
              ctx.addWatchFile(filePath);
              return input;
            } else {
              return null;
            }
          })
          .filter((i) => i !== null) as any;

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
        const data = loadExamplesData(this as any);
        return `const exampleSections = ${JSON.stringify(data)};export default exampleSections;`;
      }
      return null;
    },
  };
}

export function tutorialData(routesDir: string): Plugin {
  const dir = join(routesDir, 'tutorial');
  const menuPath = join(dir, 'tutorial-menu.json');
  const menuSrc = readFileSync(menuPath, 'utf-8');

  const loadTutorialData = (ctx: PluginContext) => {
    const sections: TutorialSection[] = [];
    const dataSections: TutorialSection[] = JSON.parse(menuSrc);
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

      const section: TutorialSection = {
        ...dataSection,
        apps: [],
      };

      for (const app of dataSection.apps) {
        const appDir = join(sectionDir, app.id);
        if (!existsSync(appDir)) {
          throw new Error(`Tutorial app "${appDir}" doesn't exist`);
        }

        const s = statSync(appDir);
        if (!s.isDirectory()) {
          throw new Error(`Tutorial app "${appDir}" is not a directory`);
        }

        const readAppInputs = (appType: 'problem' | 'solution') => {
          const appTypeDir = join(appDir, appType);

          if (!existsSync(appTypeDir)) {
            throw new Error(`Tutorial "${appType}" dir "${appTypeDir}" doesn't exist`);
          }

          const s = statSync(sectionDir);
          if (!s.isDirectory()) {
            throw new Error(`Tutorial "${appType}" dir "${appTypeDir}" is not a directory`);
          }

          const inputs: ReplModuleInput[] = readdirSync(appTypeDir)
            .map((fileName) => {
              const filePath = join(appTypeDir, fileName);
              const s = statSync(filePath);
              if (s.isFile()) {
                const input: ReplModuleInput = {
                  path: `/${fileName}`,
                  code: readFileSync(filePath, 'utf-8'),
                };
                ctx.addWatchFile(filePath);
                return input;
              } else {
                return null;
              }
            })
            .filter((i) => i !== null) as any;

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
        const data = loadTutorialData(this as any);
        return `const tutorialSections = ${JSON.stringify(data)};export default tutorialSections;`;
      }
      return null;
    },
  };
}

// Workaround for https://github.com/vitejs/vite/issues/15753
// A vite plugin that implements what `?raw&url` should do
// Use `import url from 'file?raw-source'` to get the url for the raw file content
export function rawSource(): Plugin {
  let base: string;
  let isDev: boolean = false;
  let doSourceMap: boolean = false;
  const extToMime = {
    mjs: 'application/javascript',
    js: 'application/javascript',
    css: 'text/css',
    html: 'text/html',
    json: 'application/json',
    wasm: 'application/wasm',
  };
  return {
    name: 'raw-source',

    configResolved(config) {
      base = config.base;
      isDev = config.command === 'serve';
      doSourceMap = !!config.build.sourcemap;
    },

    configureServer(server) {
      // Vite still processes /@fs urls, so we need to run our own static server
      server.middlewares.use((req, res, next) => {
        if (req.url!.startsWith('/@raw-fs')) {
          const filePath = req.url!.slice('/@raw-fs'.length).split('?')[0];
          if (existsSync(filePath)) {
            const ext = filePath.split('.').pop()! as keyof typeof extToMime;
            const contentType = extToMime[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.end(readFileSync(filePath));
          } else {
            res.statusCode = 404;
            res.end('File not found');
          }
        } else {
          next();
        }
      });
    },

    resolveId: {
      order: 'pre',
      async handler(id, importer) {
        const match = /^(?<path>.*)\?(|(?<before>.+)&)raw-source($|&(?<after>.*))/.exec(id);

        if (match) {
          const newQuery = [match.groups!.before, match.groups!.after].filter(Boolean).join('&');
          const newId = `${match.groups!.path}${newQuery ? `?${newQuery}` : ''}`;
          const resolved = await this.resolve(newId, importer, {
            skipSelf: true,
          });
          if (!resolved) {
            throw new Error(`Could not resolve "${id}" from "${importer}"`);
          }
          return `\0raw-source:${resolved!.id.split('?')[0]}`;
        }
      },
    },

    load(id) {
      if (id.startsWith('\0raw-source:')) {
        let path = id.slice('\0raw-source:'.length);
        if (path.startsWith('/@fs/')) {
          path = path.slice('/@fs'.length);
        }
        if (path.startsWith('\x00')) {
          // let's just assume it's a path
          path = path.slice(1);
        }
        if (isDev) {
          const devUrl = `${base}@raw-fs${path}`;
          return `export default "${devUrl}";`;
        }
        const fileContent = readFileSync(path);
        const ref = this.emitFile({
          type: 'asset',
          name: basename(path),
          source: fileContent,
        });
        return {
          code: `export default "@@RAW-URL_${ref}@@";`,
          map: { version: 3, sources: [path], mappings: '' },
        };
      }
    },

    renderChunk(code, chunk) {
      // Copied from vite assets code and simplified
      let s, match;
      const regex = /@@RAW-URL_(.+)@@/g;
      while ((match = regex.exec(code))) {
        s ||= new MagicString(code);
        const ref = match[1];
        const fileName = this.getFileName(ref);
        chunk.viteMetadata!.importedAssets.add(fileName);
        s.overwrite(match.index, match.index + match[0].length, base + fileName);
      }
      return s
        ? {
            code: s ? s.toString() : code,
            map: doSourceMap ? s.generateMap({ hires: true }) : null,
          }
        : null;
    },
  };
}
