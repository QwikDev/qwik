/* eslint-disable */
import type { QPrefetchData, QPrefetchMessage } from './service-worker/types';

// Source for what becomes innerHTML to the <ServiceWorkerRegister/> script

((
  queuedBundleUrls: string[],
  swReg?: QwikServiceWorkerRegistration,
  sendPrefetch?: (data: QPrefetchData, qBase?: Element) => void,
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

  document.addEventListener('qprefetch', (ev) => {
    const data = (ev as CustomEvent<QPrefetchData>).detail;
    if (swReg) {
      sendPrefetch!(data);
    } else if (data.bundles) {
      queuedBundleUrls.push(...data.bundles);
    }
  });

  navigator.serviceWorker
    .register('__url')
    .then((reg) => {
      initServiceWorker = () => {
        swReg = reg;
        sendPrefetch!({ bundles: queuedBundleUrls });
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
