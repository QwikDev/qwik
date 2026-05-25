/**
 * Main-world SPA navigation hook for Qwik DevTools.
 *
 * Injected into the inspected page's main world by the content script. Monkey-patches
 * `history.pushState` and `history.replaceState` to post a `__QWIK_DT_NAV` message that the content
 * script listens for.
 *
 * This is necessary because the `popstate` event only fires on back/forward navigation, not on
 * programmatic pushState/replaceState calls (which Qwik Router uses for SPA transitions).
 */
(function () {
  /** @type {typeof history.pushState} */
  const originalPush = history.pushState.bind(history);
  /** @type {typeof history.replaceState} */
  const originalReplace = history.replaceState.bind(history);

  history.pushState = function () {
    originalPush.apply(this, arguments);
    window.postMessage({ type: '__QWIK_DT_NAV' }, '*');
  };

  history.replaceState = function () {
    originalReplace.apply(this, arguments);
    window.postMessage({ type: '__QWIK_DT_NAV' }, '*');
  };
})();
