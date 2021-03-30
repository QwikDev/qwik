/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

/**
 * Returns directory name of a path.
 *
 * This function removes the file portion of the path and returns directory name only.
 *
 * @param path - File path
 * @returns Directory portion of the path.
 * @public
 */
export function dirname(path: string): string {
  const idx = path.lastIndexOf('/', path.length - 2);
  return idx == -1 ? path : path.substr(0, idx + 1);
}
