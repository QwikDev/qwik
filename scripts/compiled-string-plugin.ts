import { minify } from 'terser';
import type { Plugin } from 'vite';

const isCompiledStringId = (id: string) => /[?&]compiled-string/.test(id);

export function compiledStringPlugin(): Plugin {
  return {
    name: 'compiled-string-plugin',

    resolveId(id) {
      // Keep the full id if it has our query param
      if (isCompiledStringId(id)) {
        return id;
      }
      return null;
    },

    async load(id) {
      if (isCompiledStringId(id)) {
        // Extract the actual file path without the query parameter
        const filePath = id.split('?')[0];

        try {
          // Let Rollup load the file content with side effects explicitly preserved
          const result = await this.load({
            id: filePath,
            moduleSideEffects: true, // Explicitly mark as having side effects
          });

          if (!result) {
            throw new Error(`Failed to load file: ${filePath}`);
          }

          // minify the code
          const minified = await minify(result.code ?? '');
          result.code = minified.code!;

          return {
            code: `export default ${JSON.stringify(result.code)};`,
            map: null,
          };
        } catch (error) {
          console.error(`Error processing ${filePath}:`, error);
          return null;
        }
      }
      return null;
    },
  };
}
