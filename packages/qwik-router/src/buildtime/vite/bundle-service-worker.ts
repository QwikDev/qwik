import { posix } from 'node:path';
import { build, type BuildOptions, type Plugin, type Rolldown } from 'vite';

const CHUNK_ID_PREFIX = '\0qwik-router-sw-chunk:';

export async function bundleServiceWorkerChunks(
  bundle: Rolldown.OutputBundle,
  serviceWorkerChunks: Rolldown.OutputChunk[],
  minify: BuildOptions['minify'] = false
) {
  for (const swChunk of serviceWorkerChunks) {
    if (!hasChunkImports(swChunk)) {
      continue;
    }
    swChunk.code = await bundleAsClassicScript(swChunk.fileName, bundle, minify);
    swChunk.imports = [];
    swChunk.dynamicImports = [];
  }
}

function hasChunkImports(chunk: Rolldown.OutputChunk) {
  return chunk.imports.length > 0 || chunk.dynamicImports.length > 0;
}

async function bundleAsClassicScript(
  entryFileName: string,
  bundle: Rolldown.OutputBundle,
  minify: BuildOptions['minify']
) {
  const result = await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [builtChunksPlugin(bundle)],
    build: {
      write: false,
      minify,
      modulePreload: false,
      reportCompressedSize: false,
      rolldownOptions: {
        input: CHUNK_ID_PREFIX + entryFileName,
        output: { format: 'iife', codeSplitting: false },
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result as Rolldown.RolldownOutput];
  return outputs[0].output[0].code;
}

function builtChunksPlugin(bundle: Rolldown.OutputBundle): Plugin {
  return {
    name: 'vite-plugin-qwik-router-sw-chunks',
    resolveId(source, importer) {
      if (source.startsWith(CHUNK_ID_PREFIX)) {
        return source;
      }
      if (!importer?.startsWith(CHUNK_ID_PREFIX)) {
        return null;
      }
      const importerFileName = importer.slice(CHUNK_ID_PREFIX.length);
      const fileName = posix.join(posix.dirname(importerFileName), source);
      return bundle[fileName]?.type === 'chunk' ? CHUNK_ID_PREFIX + fileName : null;
    },
    load(id) {
      if (!id.startsWith(CHUNK_ID_PREFIX)) {
        return null;
      }
      const output = bundle[id.slice(CHUNK_ID_PREFIX.length)];
      return output?.type === 'chunk' ? output.code : null;
    },
  };
}
