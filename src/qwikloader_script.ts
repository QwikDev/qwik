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
export const qwikLoader = (doc: Document, hasInitialized?: boolean | number) => {
  const getModuleUrl = (
    eventUrl: string | null | undefined,
    linkElm?: HTMLLinkElement,
    href?: string
  ): URL | null => {
    if (eventUrl) {
      return new URL(
        eventUrl.replace(/^(\w+):(\/)?/, (str, protocol, slash) => {
          linkElm = doc.querySelector(`[rel="q.protocol.${protocol}"]`) as HTMLLinkElement;
          href = linkElm && linkElm.href;
          if (!href) error(protocol + ' not defined');
          return href + (href!.endsWith('/') ? '' : slash || '');
        }),
        doc.baseURI
      );
    } else {
      return 0 as any;
    }
  };

  const getModuleExport = (url: URL, module: any, exportName?: string) => {
    // 1 - optional `#` at the start.
    // 2 - capture group `$1` containing the export name, stopping at the first `?`.
    // 3 - the rest from the first `?` to the end.
    // The hash string is replaced by the captured group that contains only the export name.
    // This is the same as in the `qExport()` function.
    exportName = url.hash.replace(/^#?([^?]*).*$/, '$1') || 'default';
    return module[exportName] || error(url + ' does not export ' + exportName);
  };

  /**
   * Event handler responsible for processing browser events.
   *
   * If browser emits an event, the `eventProcessor` walks the DOM tree
   * looking for corresponding `(${event.type})`. If found the event's URL
   * is parsed and `import()`ed.
   *
   * @param ev - Browser event.
   */
  const processEvent = async (ev: Event, element?: Element | null, url?: URL | null) => {
    element = ev.target as Element | null;

    // while (element && element.getAttribute) {
    // while (element && element.nodeType===1) {
    while (element && element.getAttribute) {
      url = getModuleUrl(element.getAttribute('on:' + ev.type));
      if (url) {
        const handler = getModuleExport(url, await import((url.pathname += '.js')));
        handler(element, ev, url);
      }
      element = element.parentElement;
    }
  };

  const addEventListener = (eventName: string) =>
    doc.addEventListener(eventName, processEvent, { capture: true });

  const qInit = `q-init`;
  const processReadyStateChange = (readyState?: DocumentReadyState) => {
    readyState = doc.readyState;
    if (!hasInitialized && (readyState == 'interactive' || readyState == 'complete')) {
      hasInitialized = 1;
      doc
        .querySelectorAll('[on\\:\\' + qInit + ']')
        .forEach((target) => target.dispatchEvent(new CustomEvent(qInit)));
    }
  };

  const error = (msg: string) => {
    throw new Error('QWIK: ' + msg);
  };

  // Set up listeners. Start with `document` and walk up the prototype
  // inheritance on look for `on*` properties. Assume that `on*` property
  // corresponds to an event browser can emit.
  if ((window as LoaderWindow).BuildEvents) {
    (window as LoaderWindow).qEvents!.forEach(addEventListener);
  } else {
    const scriptTag = doc.querySelector('script[events]');
    if (scriptTag) {
      const events = scriptTag!.getAttribute('events') || '';
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
  }

  addEventListener(qInit);
  doc.addEventListener('readystatechange', processReadyStateChange as any);
  processReadyStateChange();

  return {
    getModuleUrl,
    getModuleExport,
    processReadyStateChange,
  };
};

export interface LoaderWindow {
  BuildEvents?: boolean;
  qEvents?: string[];
}
