/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/**
 * Extract the QRL params from a URL.
 *
 * These params are encoded after the `?` in the hash of the URL, not the URL's search params.
 */
export function qParams(url: URL): URLSearchParams {
  // 1 - everything up to the first `?` (or the end of the string).
  // 2 - an optional `?`.
  // 3 - capture group `$1` containing everything after the first `?` to the end of the string.
  // The hash string is replaced by the captured group that contains only the serialized params.
  //                                           11111122233333
  return new URLSearchParams(url.hash.replace(/^[^?]*\??(.*)$/, '$1'));
}

export function updateElement(element: Element, event: Event, url: URL) {
  const params = qParams(url);
  const selector = params.get('selector')!;
  const content = params.get('content')!;
  const ref = document.querySelector(selector);
  ref!.textContent = content;
}
