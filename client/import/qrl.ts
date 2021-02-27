/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertEqual } from '../assert/index.js';
import { qImportInternal } from './qImport.js';
import '../util/qDev.js';

/**
 * `QRL` (Qoot Resource Locator) represents an import which points to a lazy loaded resource.
 *
 * QRL is a URL pointing to a lazy loaded resource. Because the URLs need to be verified
 * (and possibly bundled) there needs to be a way to identify all URL strings in the system.
 * QRL serves the purpose of statically tagging all URLs for static code analysis and for
 * development mode verification.
 *
 * In dev mode (`qDev=true`) the `QRL` eagerly tries to resolve the URLs to verify that they
 * are correct. This is done to notify the developer of any mistakes as soon as possible.
 *
 * @publicAPI
 */
export interface QRL {
  __brand__: 'QRL';
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
 * @publicAPI
 */
export function QRL(messageParts: TemplateStringsArray, ...expressions: readonly any[]): QRL {
  const url = messageParts.join('');
  qDev && assertEqual(url.charAt(0), '.', "Expecting URL to start with '.'.");
  if (qDev) {
    verifyQrl(new Error(), url);
  }
  return (url as unknown) as QRL;
}

export function verifyQrl(error: Error, url: string): Promise<any> {
  const stack = error.stack;
  if (!stack) return Promise.resolve(null);
  const frames = stack.split('\n');
  // 0: Error
  // 1:   at QRL (this function)
  // 2:   at caller (this is what we are looking for)
  const previousFrame = frames[2];
  const match = previousFrame.match(/\(?(\S*):\d+:\d+\)?/);
  let baseUrl = (match && match[1]) || '';
  return qImportInternal(url, baseUrl, previousFrame);
}
