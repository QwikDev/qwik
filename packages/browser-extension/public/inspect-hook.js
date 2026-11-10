/**
 * Main-world element picker for Qwik DevTools.
 *
 * Injected into the inspected page's main world by the content script. Must run in the SAME world
 * as qwikloader so that `stopImmediatePropagation` actually blocks Qwik's event handlers.
 *
 * Lifecycle:
 *
 * 1. Content script posts `__QWIK_DT_INSPECT_START` to activate.
 * 2. User clicks an element on the page.
 * 3. This script intercepts the click (window capture, before qwikloader), resolves the owning
 *    component's tree node ID, and posts `__QWIK_DT_ELEMENT_PICKED` back to the content script.
 * 4. Content script forwards the result to the devtools panel. Any page script can post this message,
 *    so the content script only accepts it after its own trusted pointerdown and takes the picked
 *    element's DOM identity from that event, not from here.
 *
 * Why window capture? Qwik's qwikloader registers its click handler on `document` in capture.
 * Capture order is: window > document > html > body > ... > target. By listening on `window` we
 * fire BEFORE qwikloader.
 */
(function () {
  /** @type {boolean} Whether The picker is currently active. */
  let active = false;

  /**
   * Listen for activation/deactivation messages from the content script.
   *
   * @param {MessageEvent} e
   */
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    if (e.data && e.data.type === '__QWIK_DT_INSPECT_START') active = true;
    if (e.data && e.data.type === '__QWIK_DT_INSPECT_STOP') active = false;
  });

  /**
   * Try to resolve a DOM element to its owning Qwik component's tree node ID using the devtools
   * hook installed by the Vite plugin.
   *
   * @param {Element} target - The clicked DOM element.
   * @returns {string | null} Tree node ID (e.g. "vnode-5"), or null.
   */
  function resolveComponentId(target) {
    try {
      const hook = window.__QWIK_DEVTOOLS__ && window.__QWIK_DEVTOOLS__.hook;
      if (hook && typeof hook.resolveElementToComponent === 'function') {
        return hook.resolveElementToComponent(target);
      }
    } catch (_) {}
    return null;
  }

  // Click interceptor (window capture - fires before qwikloader)
  window.addEventListener(
    'click',
    function (e) {
      if (!active) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      active = false;

      /** @type {{ type: string; treeNodeId: string | null }} */
      const msg = {
        type: '__QWIK_DT_ELEMENT_PICKED',
        treeNodeId: resolveComponentId(e.target),
      };
      window.postMessage(msg, '*');
      return false;
    },
    true
  );

  // Block mousedown/mouseup to prevent focus, text selection, and button activation.
  ['mousedown', 'mouseup'].forEach(function (eventName) {
    window.addEventListener(
      eventName,
      function (e) {
        if (!active) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        return false;
      },
      true
    );
  });
})();
