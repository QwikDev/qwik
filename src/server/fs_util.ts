/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import * as fs from 'fs';
import { join } from 'path';

export function findFiles(
  baseDir: string,
  pattern: string | RegExp,
  fn: (fullPath: string, filename: string, relativePath: string) => void,
  relativeDir: string = ''
) {
  const fullPathDir = join(baseDir, relativeDir);
  fs.readdirSync(fullPathDir).forEach((name) => {
    const fullPathFile = join(fullPathDir, name);
    if (pattern instanceof RegExp ? pattern.exec(name) : pattern === name) {
      fn(fullPathFile, name, relativeDir);
    }
    if (fs.statSync(fullPathFile).isDirectory()) {
      findFiles(baseDir, pattern, fn, join(relativeDir, name));
    }
  });
}
