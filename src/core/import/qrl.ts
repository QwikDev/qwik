/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { assertEqual } from '../assert/index.js';
import { qImport, toUrl } from './qImport.js';
import '../util/qDev.js';
import { getConfig } from '../config/qGlobal.js';
import { getFilePathFromFrame } from '../util/base_uri.js';
import { isPromise } from '../util/promises.js';

/**
 * `QRL` (Qwik Resource Locator) represents an import which points to a lazy loaded resource.
 *
 * QRL is a URL pointing to a lazy loaded resource. Because the URLs need to be verified
 * (and possibly bundled) there needs to be a way to identify all URL strings in the system.
 * QRL serves the purpose of statically tagging all URLs for static code analysis and for
 * development mode verification.
 *
 * QRLs can use custom protocols for referring to URLs in a baseURI independent way. This is
 * useful for third-party libraries. Third-party libraries don't know what URL they will be
 * installed at. For this reason the third-party libraries do all QRLs prefixed with
 * custom protocol and rely on the application to configure such protocol.
 *
 * ```
 * QRL`someLibrary:/someImport`
 *
 * Q = {
 *   protocol: {
 *     'someLibrary': 'somePath'
 *   }
 * }
 * ```
 * The `QRL` looks up `foo` in `QRLProtocolMap` resulting in `somePath/someImport`.
 *
 * In dev mode (`qDev=true`) the `QRL` eagerly tries to resolve the URLs to verify that they
 * are correct. This is done to notify the developer of any mistakes as soon as possible.
 *
 * @public
 */
export interface QRL<T = any> {
  __brand__: 'QRL';
  __brand__T__: T;
}

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
): QRL<T> {
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
  return url as unknown as QRL<T>;
}

export async function verifyQrl(error: Error, url: string): Promise<any> {
  const stack = error.stack;
  if (!stack) return Promise.resolve(null);
  const frames = stack.split('\n');
  // 0: Error
  // 1:   at QRL (this function)
  // 2:   at caller (this is what we are looking for)
  let frame: string = '';
  for (let i = 2; i < frames.length; i++) {
    frame = frames[i];
    if (frame.indexOf('/node_modules/vm2/') === -1) {
      // It is possible that VM2 library was use to load us, in which case we should skip it.
      break;
    }
  }
  const base = getFilePathFromFrame(frame);
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
