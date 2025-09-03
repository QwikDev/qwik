import type { ReplModuleInput } from '../types';

interface RollupPlugin {
  name: string;
  resolveId?: (id: string, importer?: string) => string | null | undefined;
  load?: (id: string) => string | null | undefined;
}

export const createMemfsPlugin = (files: ReplModuleInput[]): RollupPlugin => {
  const fileMap = new Map<string, string>();

  // Initialize file map
  files.forEach((file) => {
    fileMap.set(file.path, file.code);
  });

  return {
    name: 'repl-memfs',

    resolveId(id: string, importer?: string) {
      // Handle relative imports
      if (id.startsWith('./')) {
        if (importer) {
          const importerDir = importer.substring(0, importer.lastIndexOf('/'));
          const resolvedPath = `${importerDir}/${id.slice(2)}`;
          // Try different extensions
          const extensions = ['', '.tsx', '.ts', '.js', '.jsx', '.mjs'];
          for (const ext of extensions) {
            const testPath = resolvedPath + ext;
            if (fileMap.has(testPath)) {
              return testPath;
            }
          }
        }
      }

      // Check if it's a direct file path
      if (fileMap.has(id)) {
        return id;
      }

      // For external modules, let rollup handle them
      return null;
    },

    load(id: string) {
      const code = fileMap.get(id);
      if (code !== undefined) {
        return code;
      }
      return null;
    },
  };
};
