/* eslint-disable */

// Source script which will be built as an IIFE used as innerHTML for
// the inlined service worker registration script on the main thread
// Keep ES5 and IE11 friendly

(function (
  serviceWorker: ServiceWorkerContainer,
  queuedUrls: string[],
  swReg?: ServiceWorkerRegistration
) {
  function sendToServiceWorker(ev: QPrefetchUrlsEvent) {
    if (swReg) {
      swReg.active && swReg.active.postMessage({ qprefetchurls: ev.detail });
    } else {
      queuedUrls = queuedUrls.concat(ev.detail);
    }
  }

  if (serviceWorker) {
    addEventListener('qprefetchurls', sendToServiceWorker as any);

    serviceWorker.register('_url').then(function (reg) {
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
  }
})(navigator.serviceWorker, []);

interface QPrefetchUrlsEvent {
  detail: string[];
}

export default '';
