/* eslint-disable */

// Source script which will be built as an IIFE used as innerHTML for
// the inlined service worker registration script on the main thread

((queuedUrls: string[], swReg?: ServiceWorkerRegistration) => {
  const sendToServiceWorker = (ev: QPrefetchUrlsEvent) => {
    if (swReg) {
      swReg.active && swReg.active.postMessage({ qprefetchurls: ev.detail });
    } else {
      queuedUrls = queuedUrls.concat(ev.detail);
    }
  };

  addEventListener('qprefetchurls', sendToServiceWorker as any);

  navigator.serviceWorker.register('_url').then((reg) => {
    if (reg.installing) {
      reg.installing.addEventListener('statechange', (ev: any) => {
        if (ev.target.state == 'activated') {
          swReg = reg;
          sendToServiceWorker({ detail: queuedUrls });
        }
      });
    } else if (reg.active) {
      swReg = reg;
      sendToServiceWorker({ detail: queuedUrls });
    }
  });
})([]);

export interface QPrefetchUrlsEvent {
  detail: string[];
}
