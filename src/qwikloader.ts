/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/**
 * @fileoverview This is qwik-loader.
 *
 * This code should be included too bootstrap qwik sub-framework.
 * The purpose of the qwik-loader is to listen for browser events, find
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
 * @param doc - Document to use for setting up global listeners, and to
 *     determine all of the browser supported events.
 */
((doc: Document) => {
  // When cleared it means that `on:q-init` has been run
  let readystatechange = 'readystatechange';
  /**
   * Event handler responsible for processing browser events.
   *
   * If browser emits an event, the `eventProcessor` walks the DOM tree
   * looking for corresponding `(${event.type})`. If found the event's URL
   * is parsed and `import()`ed.
   *
   * @param ev - Browser event.
   */
  const processEvent = async (ev: Event) => {
    let element = ev.target as Element | null;
    while (element && element.getAttribute) {
      const eventUrl = element.getAttribute('on:' + ev.type);
      if (eventUrl) {
        const url = new URL(
          eventUrl.replace(/^(\w+):(\/)/, (str, protocol, slash) => {
            const linkElm = doc.querySelector(
              `link[rel="q.protocol.${protocol}"]`
            ) as HTMLLinkElement;
            const href = linkElm && linkElm.href;
            if (!href) {
              throw new Error('QWIKLOADER-ERROR: `' + protocol + '` is not defined.');
            }
            if (slash && href.endsWith('/')) {
              slash = '';
            }
            return href + slash;
          })
        );
        const importPath = url.pathname + '.js';
        const module = await import(importPath);
        // 1 - optional `#` at the start.
        // 2 - capture group `$1` containing the export name, stopping at the first `?`.
        // 3 - the rest from the first `?` to the end.
        // The hash string is replaced by the captured group that contains only the export name.
        // This is the same as in the `qExport()` function.
        //                                   1112222222333
        const exportName = url.hash.replace(/^#?([^?]*).*$/, '$1') || 'default';
        const handler = module[exportName];
        if (!handler)
          throw new Error('QWIKLOADER-ERROR: ' + importPath + ' does not export ' + exportName);
        handler(element, ev, url);
      }
      element = element.parentElement;
    }
  };

  const addEventListener = (eventName: string) =>
    doc.addEventListener(eventName, processEvent, { capture: true });

  // Set up listeners. Start with `document` and walk up the prototype
  // inheritance on look for `on*` properties. Assume that `on*` property
  // corresponds to an event browser can emit.
  const scriptTag = doc.querySelector('script[events]');
  if (scriptTag) {
    const events = scriptTag.getAttribute('events') || '';
    events.split(/[\s,;]+/).forEach(addEventListener);
  } else {
    for (const key in doc) {
      if (key.indexOf('on') == 0) {
        const eventName = key.substring(2);
        // For each `on*` property, set up a listener.
        addEventListener(eventName);
      }
    }
  }

  const qInit = `q-init`;
  const processReadyStateChange = () => {
    const readyState = doc.readyState;
    if (readystatechange && (readyState == 'interactive' || readyState == 'complete')) {
      readystatechange = null!;
      doc
        .querySelectorAll('[on\\:\\' + qInit + ']')
        .forEach((target) => target.dispatchEvent(new CustomEvent(qInit)));
    }
  };

  addEventListener(qInit);
  doc.addEventListener(readystatechange, processReadyStateChange);
  processReadyStateChange();
})(
  // Invoke qwik-loader.
  document
);
