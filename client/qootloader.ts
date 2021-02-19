/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

/**
 * @fileoverview This is qoot-loader.
 *
 * This code should be included too bootstrap qoot sub-framework.
 * The purpose of the qoot-loader is to listen for browser events, find
 * corresponding event handler, and lazy load the code associated with the
 * handler.
 *
 * NOTE: This file relies on side-effect.
 */

/**
 * Set up event listening for browser.
 *
 * Determine all of the browser events and set up global listeners for them.
 * If browser triggers event search for the lazy load URL and `import()` it.
 *
 * @param document Document to use for setting up global listeners, and to
 *     determine all of the browser supported events.
 * @param Object `ObjectConstructor` used for walking prototype chains.
 */
(function (document: Document, Object: ObjectConstructor) {
  /**
   * Event handler responsible for processing browser events.
   *
   * If browser emits an event, the `eventProcessor` walks the DOM tree
   * looking for corresponding `(${event.type})`. If found the event's URL
   * is parsed and `import()`ed.
   *
   * @param event Browser event.
   */
  async function eventProcessor(event: Event) {
    const eventName = '(' + event.type + ')';
    let element = event.target as Element | null;
    while (element && element.getAttribute) {
      let eventUrl = element.getAttribute(eventName);
      if (eventUrl) {
        const url = new URL(eventUrl, document.baseURI);
        const path = url.pathname.split('.');
        let handler = await import(path.shift() + '.js');
        if (!path.length) {
          path.push('default');
        }
        while (path.length) {
          handler = handler[path.shift()!];
        }
        handler(event, element, url);
      }
      element = element.parentElement;
    }
  }

  // Set up listeners. Start with `document` and walk up the prototype
  // inheritance on look for `on*` properties. Assume that `on*` property
  // corresponds to an event browser can emit.
  let type = document;
  while (type) {
    Object.getOwnPropertyNames(type).forEach((key: string) => {
      if (key.indexOf('on') == 0) {
        const eventName = key.substring(2);
        // For each `on*` property, set up a listener.
        document.addEventListener(eventName, eventProcessor);
      }
    });
    type = Object.getPrototypeOf(type);
  }
})(
  // Invoke qoot-loader.
  document,
  Object
);
