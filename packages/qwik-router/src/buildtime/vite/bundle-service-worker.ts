import { posix } from 'node:path';
import { build, type BuildOptions, type Plugin, type Rolldown } from 'vite';

const CHUNK_ID_PREFIX = '\0qwik-router-sw-chunk:';

/**
 * Inlines the chunks that service worker chunks import, because service workers are registered as
 * classic scripts and can't load ES modules.
 */
export async function bundleServiceWorkerChunks(
  bundle: Rolldown.OutputBundle,
  serviceWorkerChunks: Rolldown.OutputChunk[],
  minify: BuildOptions['minify'] = false
) {
  const chunksByFileName = new Map<string, Rolldown.OutputChunk>();
  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk') {
      chunksByFileName.set(output.fileName, output);
    }
  }

  for (const swChunk of serviceWorkerChunks) {
    if (!hasChunkImports(swChunk)) {
      continue;
    }
    swChunk.code = await bundleAsClassicScript(swChunk.fileName, chunksByFileName, minify);
    swChunk.imports = [];
    swChunk.dynamicImports = [];
  }
}

function hasChunkImports(chunk: Rolldown.OutputChunk) {
  return chunk.imports.length > 0 || chunk.dynamicImports.length > 0;
}

/** Re-bundles already built chunks, starting at `entryFileName`, into a single IIFE script. */
async function bundleAsClassicScript(
  entryFileName: string,
  chunksByFileName: Map<string, Rolldown.OutputChunk>,
  minify: BuildOptions['minify']
) {
  const result = await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: 'silent',
    plugins: [builtChunksPlugin(chunksByFileName)],
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

/** Serves the client build's chunks by file name, resolving imports between them. */
function builtChunksPlugin(chunksByFileName: Map<string, Rolldown.OutputChunk>): Plugin {
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
      return chunksByFileName.has(fileName) ? CHUNK_ID_PREFIX + fileName : null;
    },
    load(id) {
      if (!id.startsWith(CHUNK_ID_PREFIX)) {
        return null;
      }
      return chunksByFileName.get(id.slice(CHUNK_ID_PREFIX.length))?.code ?? null;
    },
  };
}
