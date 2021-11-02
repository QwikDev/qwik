import type { Manifest, ManifestFile } from '.';

export class ManifestBuilder {
  private fileExports = new Map<string, string[]>();

  addFileExports(path: string, symbols: string[]) {
    if (typeof path === 'string') {
      if (Array.isArray(symbols)) {
        symbols = [...symbols];
      } else {
        symbols = [];
      }
      this.fileExports.set(path, symbols);
    }
  }

  generate() {
    const result: Manifest = {
      files: {},
    };

    const sortedFileNames = Object.keys(this.fileExports).sort();

    sortedFileNames.forEach((path) => {
      const sortedExports = [...this.fileExports.get(path)!].sort();
      const manifestFile: ManifestFile = {
        exports: sortedExports,
      };
      result.files[path] = manifestFile;
    });

    return result;
  }

  toJSON() {
    const result = this.generate();
    return JSON.stringify(result, null, 2);
  }

  toYAML() {
    const result = this.generate();
    const yaml: string[] = [];

    yaml.push(`- Files`);
    yaml.push(``);

    Object.entries(result.files).forEach(([path, manifestFile]) => {
      yaml.push(`  - ${path}`);
      manifestFile.exports.forEach((symbolExport) => {
        yaml.push(`    - ${symbolExport}`);
      });
      yaml.push(``);
    });

    return yaml.join('\n') + '\n';
  }
}
