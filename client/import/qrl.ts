/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertEqual } from '../assert/index.js';
import { qImportInternal } from './qImport.js';
import { QRL as QRL_ } from './types.js';
import '../util/qDev.js';

export type QRL = QRL_;
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
      url.startsWith('.') ||
        url.startsWith('/') ||
        url.startsWith('file:') ||
        url.startsWith('http:') ||
        url.startsWith('https:'),
      true,
      "Expecting URL to start with '.', '/', 'file:', 'http:' or 'https'. Was: " + url
    );
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
