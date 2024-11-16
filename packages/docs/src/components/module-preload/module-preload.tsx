import { component$, sync$, useOnWindow } from '@qwik.dev/core';

export const ModulePreload = component$(() => {
  useOnWindow(
    'load',
    sync$(() => {
      // for safari support
      if (!window.requestIdleCallback) {
        window.requestIdleCallback = function (
          callback: IdleRequestCallback,
          options?: IdleRequestOptions
        ): number {
          const opts = options || {};
          const relaxation = 1;
          const timeout = opts.timeout || relaxation;
          const start = performance.now();
          return setTimeout(function () {
            callback({
              get didTimeout() {
                return opts.timeout ? false : performance.now() - start - relaxation > timeout;
              },
              timeRemaining: function () {
                return Math.max(0, relaxation + (performance.now() - start));
              },
            });
          }, relaxation) as unknown as number;
        };
      }

      const startPreloading = () => {
        const stateScript = document.querySelector('script[type="qwik/state"]');
        if (!stateScript?.textContent) return;

        const state = JSON.parse(stateScript.textContent);
        const qChunks = new Set<string>();

        JSON.stringify(state).replace(/q-[A-Za-z0-9_]+\.js/g, (match) => {
          qChunks.add(match);
          return match;
        });

        qChunks.forEach((chunk) => {
          const link = document.createElement('link');
          link.rel = 'modulepreload';
          link.as = 'script';
          link.href = 'build/' + chunk;
          document.head.appendChild(link);
        });
      };

      requestIdleCallback(startPreloading);
    })
  );

  return <></>;
});
