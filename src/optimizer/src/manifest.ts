import type { Manifest, ManifestFile } from ".";

export class ManifestBuilder {
  private files: ManifestFile[] = [];

  addFile(file: ManifestFile) {
    this.files.push(file);
  }

  generate() {
    const result: Manifest = {};

    return result
  } 
}
