/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

export function updateElement(element: Element, event: Event, url: URL) {
  const params = url.searchParams;
  const selector = params.get('selector')!;
  const content = params.get('content')!;
  const ref = document.querySelector(selector);
  ref!.textContent = content;
}
