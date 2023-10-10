/* eslint-disable */
import type { QPrefetchData, QPrefetchMessage } from './service-worker/types';

// Source for what becomes innerHTML to the <ServiceWorkerRegister/> script

((
  queuedEventDetails: any[],
  swReg?: QwikServiceWorkerRegistration,
  sendPrefetch?: (data: QPrefetchData) => void,
  initServiceWorker?: () => void
) => {
  sendPrefetch = (data) => {
    const qBase = document.querySelector('[q\\:base]')!;
    if (qBase) {
      swReg!.active &&
        swReg!.active.postMessage({
          type: 'qprefetch',
          base: qBase.getAttribute('q:base')!,
          ...data,
        });
    }
  };

  document.addEventListener('qprefetch', (ev) => {
    const detail = (ev as CustomEvent<QPrefetchData>).detail;
    if (swReg) {
      sendPrefetch!(detail);
    } else {
      queuedEventDetails.push(detail);
    }
  });

  navigator.serviceWorker
    .register('__url')
    .then((reg) => {
      initServiceWorker = () => {
        swReg = reg;
        queuedEventDetails.forEach(sendPrefetch!);
        sendPrefetch!({ bundles: queuedEventDetails });
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
  postMessage(data: QPrefetchMessage): void;
}

interface QwikServiceWorkerRegistration extends ServiceWorkerRegistration {
  active: QwikServiceWorker | null;
}
