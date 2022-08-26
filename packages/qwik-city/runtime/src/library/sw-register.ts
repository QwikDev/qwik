/* eslint-disable */
import type { QrlPrefetchData, QrlPrefetchMessage } from './types';

// Source for what becomes innerHTML to the <ServiceWorkerRegister/> script

((
  queuedUrls: string[],
  swReg?: QwikServiceWorkerRegistration,
  sendPrefetch?: (data: QrlPrefetchData, qBase?: Element) => void,
  initServiceWorker?: () => void
) => {
  sendPrefetch = (data, qBase) => {
    qBase = document.querySelector('[q\\:base]')!;
    if (qBase) {
      swReg!.active &&
        swReg!.active.postMessage({
          type: 'qprefetch',
          base: qBase.getAttribute('q:base')!,
          ...data,
        });
    }
  };

  addEventListener('qprefetch', (ev) => {
    const data = ev.detail;
    if (swReg) {
      sendPrefetch!(data);
    } else if (data.urls) {
      queuedUrls.push(...data.urls);
    }
  });

  navigator.serviceWorker
    .register('__url')
    .then((reg) => {
      initServiceWorker = () => {
        swReg = reg;
        sendPrefetch!({ urls: queuedUrls });
      };

      if (reg.installing) {
        reg.installing.addEventListener('statechange', (ev: any) => {
          if (ev.target.state == 'activated') {
            initServiceWorker!();
          }
        });
      } else if (reg.active) {
        initServiceWorker!();
      }
    })
    .catch((e) => console.error(e));
})([]);

interface QwikServiceWorker extends ServiceWorker {
  postMessage(data: QrlPrefetchMessage): void;
}

interface QwikServiceWorkerRegistration extends ServiceWorkerRegistration {
  active: QwikServiceWorker | null;
}

interface QPrefetchEvent extends CustomEvent {
  detail: QrlPrefetchData;
}

declare const addEventListener: (type: 'qprefetch', cb: (ev: QPrefetchEvent) => void) => void;
