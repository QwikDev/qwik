import { readFileSync } from 'fs';
import { isBinaryPath } from './tools/binary-extensions';
import { visitNotIgnoredFiles } from './tools/visit-not-ignored-files';

const warnings: string[] = [];

/** Records something the migration could not do automatically, printed at the end. */
export function warn(file: string, message: string) {
  warnings.push(`${file}: ${message}`);
}

/** Returns the recorded warnings and clears them. */
export function takeWarnings() {
  return warnings.splice(0);
}

/** Warns for every non-binary file containing `text`. */
export function warnMentions(text: string, message: string) {
  visitNotIgnoredFiles('.', (path) => {
    if (!isBinaryPath(path) && readFileSync(path, 'utf-8').includes(text)) {
      warn(path, message);
    }
  });
}
