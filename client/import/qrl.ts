/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertEqual } from '../assert/index.js';
import { qImport, toUrl } from './qImport.js';
import { QRL as QRL_ } from './types.js';
import '../util/qDev.js';
import { getConfig } from '../config/qGlobal.js';
import { getFilePathFromFrame } from '../util/base_uri.js';
import { isPromise } from '../util/promises.js';

/**
 * `QRL` is a type safe version of QRL.
 *
 * `QRL` is just a string at runtime. For type safety reasons `QRL` type is used
 * to force the developer to mark the string like so:
 *
 * ```
 * qImport(QRL`pathToResource`);
 * ```
 *
 * Marking the QRL with a tagged-template-literal allows for two things:
 * 1. the `QRL` tag can verify that the URL is valid eagerly (and report the errors as soon as
 *    possible.)
 * 2. the `QRL` tag easily identifies all of the `QRL`s in the application allowing future
 *    tooling to manipulate it.
 *
 * @public
 */
export type QRL<T = any> = QRL_<T>;
/**
 * Tag template literal factory.
 *
 * SEE: `QRL` interface for details
 *
 * Intended usage:
 * ```
 * QRL`./path_to_resource`
 * ```
 * @public
 */
export function QRL<T = any>(
  messageParts: TemplateStringsArray,
  ...expressions: readonly any[]
): QRL_<T> {
  let url = '';
  for (let i = 0; i < messageParts.length; i++) {
    const part = messageParts[i];
    url += part;
    if (i < expressions.length) {
      url += expressions[i];
    }
  }
  qDev &&
    assertEqual(
      !!url.match(/^[.|/|\w+:]/),
      true,
      "Expecting URL to start with '.', '/', '<protocol>:'. Was: " + url
    );
  if (qDev) {
    verifyQrl(new Error('Invalid import: ' + url), url);
  }
  return (url as unknown) as QRL_<T>;
}

export async function verifyQrl(error: Error, url: string): Promise<any> {
  const stack = error.stack;
  if (!stack) return Promise.resolve(null);
  const frames = stack.split('\n');
  // 0: Error
  // 1:   at QRL (this function)
  // 2:   at caller (this is what we are looking for)
  const base = getFilePathFromFrame(frames[2]);
  const config = getConfig(base);
  try {
    const module = qImport(config, url);
    if (isPromise(module)) {
      return module.catch((e) => {
        return Promise.reject(makeError(e));
      });
    }
    return module;
  } catch (e) {
    throw new Error(makeError(e));
  }

  function makeError(e: unknown) {
    return `QRL-ERROR: '${url}' is not a valid import. 
Resolved URL: ${toUrl(base, url)}
    Base URL: ${config.baseURI}
      CONFIG: ${JSON.stringify(config)}
       STACK: ${stack}\n  => ${e}`;
  }
}
