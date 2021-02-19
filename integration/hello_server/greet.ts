/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxRender } from './qoot.js';
import { helloWorld } from './hello_world.js';
import { eventHandler, injectSourceElement } from './qoot.js';

export const change = eventHandler(
  injectSourceElement(HTMLInputElement),
  function (element: HTMLInputElement) {
    // TODO: This Component should inject host element
    let hostElement = element as HTMLElement;
    while (hostElement.tagName.toLowerCase() !== 'hello-world') {
      hostElement = hostElement.parentElement!;
    }

    // TODO: This Component should use state.
    const name = element.value;

    // TODO: Instead of calling jsxRender we should be marking the component dirty.
    jsxRender(hostElement, helloWorld({ name }));
  }
);
