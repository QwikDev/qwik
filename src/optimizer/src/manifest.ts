import type { Manifest, ManifestFile } from '.';

export function generateManifest(outputSymbols: Map<string, string[]>) {
  const result: Manifest = {
    files: {},
  };

  const sortedFileNames = Object.keys(outputSymbols).sort();

  sortedFileNames.forEach((path) => {
    const sortedExports = [...outputSymbols.get(path)!].sort();
    const manifestFile: ManifestFile = {
      exports: sortedExports,
    };
    result.files[path] = manifestFile;
  });

  return result;
}

export function serializeManifest(result: Manifest) {
  const yaml: string[] = [];

  yaml.push(`---`);
  yaml.push(`Files:`);

  Object.entries(result.files).forEach(([path, manifestFile]) => {
    yaml.push(`  ${path}:`);
    manifestFile.exports.forEach((symbolExport) => {
      yaml.push(`    - ${symbolExport}`);
    });
  });

  return yaml.join('\n') + '\n';
}

export function parseManifest(yamlManifest: string) {
  const result: Manifest = {
    files: {},
  };
  return result;
}
