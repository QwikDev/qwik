/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import './qDev.js';
import { assertLess, assertLessOrEqual } from '../assert/assert.js';
import { qError, QError } from '../error/error.js';

/**
 * Return the baseUri from the stack trace.
 *
 * @param offset - number of frames to look above the invocation of the call site. This is a negative number.
 */
export function getBaseUri(offset: number = 0): string {
  qDev && assertLessOrEqual(offset, 0, '`offset` should be <= 0 was: ' + offset);
  const error = new Error();
  const frames = error.stack!.split('\n');
  const frameIdx = 2 - offset;
  qDev && assertLess(frameIdx, frames.length);
  return getFilePathFromFrame(frames[frameIdx]);
}

export function getFilePathFromFrame(frame: string): string {
  const match = frame.match(/\(?(\S*):\d+:\d+\)?/);
  if (!match) {
    throw qError(QError.Core_unrecognizedStack_frame, frame);
  }
  const path = match[1];
  return path.replace(/\.(ts|tsx)$/, '.js');
}
