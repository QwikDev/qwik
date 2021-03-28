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

interface QConfig {
  protocol: {
    [protocol: string]: string;
  };
}

/**
 * Set up event listening for browser.
 *
 * Determine all of the browser events and set up global listeners for them.
 * If browser triggers event search for the lazy load URL and `import()` it.
 *
 * @param document Document to use for setting up global listeners, and to
 *     determine all of the browser supported events.
 */
(function (document: Document) {
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
    const eventName = 'on:' + event.type;
    let element = event.target as Element | null;
    while (element && element.getAttribute) {
      let eventUrl = element.getAttribute(eventName);
      if (eventUrl) {
        eventUrl = eventUrl.replace(/^(\w+):/, (_, protocol) => {
          return ((window as any) as { Q: QConfig }).Q.protocol[protocol];
        });
        const url = new URL(eventUrl, document.baseURI);
        const pathname = url.pathname;
        let dotIdx = pathname.lastIndexOf('.');
        const slashIdx = pathname.lastIndexOf('/');
        if (dotIdx === 0 || dotIdx < slashIdx) dotIdx = pathname.length;
        const importPath = pathname.substr(0, dotIdx) + '.js';
        const module = await import(importPath);
        const exportName = pathname.substring(dotIdx + 1) || 'default';
        const handler = module[exportName];
        if (!handler)
          throw new Error(
            `QOOTLOADER-ERROR: import '${importPath}' does not export '${exportName}'.`
          );
        handler(element, event, url);
      }
      element = element.parentElement;
    }
  }

  // Set up listeners. Start with `document` and walk up the prototype
  // inheritance on look for `on*` properties. Assume that `on*` property
  // corresponds to an event browser can emit.
  const scriptTag = document.querySelector('script[events]');
  if (scriptTag) {
    const events = scriptTag.getAttribute('events') || '';
    events.split(/[\s,;]+/).forEach((name) => document.addEventListener(name, eventProcessor));
  } else {
    for (const key in document) {
      if (key.indexOf('on') == 0) {
        const eventName = key.substring(2);
        // For each `on*` property, set up a listener.
        document.addEventListener(eventName, eventProcessor);
      }
    }
  }
})(
  // Invoke qoot-loader.
  document
);
