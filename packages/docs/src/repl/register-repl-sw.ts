let promise: Promise<ServiceWorkerRegistration | null> | null = null;

const _registerReplSW = async (retries = 5) => {
  // We provide repl-sw.js via /routes/repl/repl-sw.js/entry.ts
  try {
    const reg = await navigator.serviceWorker.register('/repl/repl-sw.js', {
      scope: '/repl/',
    });

    // Always listen for updates. A new installing worker can appear at any time.
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) {
        return;
      }
      let isRefreshing = false;
      newWorker.addEventListener('statechange', (ev: any) => {
        const state = ev?.target?.state;
        // console.debug('Qwik REPL service worker installing state: %s', state);
        if (state === 'activated') {
          // Wait for the new worker to take control of the page before reloading.
          const reloadWhenControlled = () => {
            if (isRefreshing) {
              return;
            }
            isRefreshing = true;
            navigator.serviceWorker.removeEventListener('controllerchange', reloadWhenControlled);
            window.location.reload();
          };

          if (navigator.serviceWorker.controller) {
            // If there's already a controller, reload now.
            reloadWhenControlled();
          } else {
            // Otherwise wait for controllerchange which signals the new worker controls the page.
            navigator.serviceWorker.addEventListener('controllerchange', reloadWhenControlled);
          }
        } else if (state === 'redundant') {
          // console.warn('Qwik REPL service worker became redundant during installation');
          // If no active worker remains, try re-registering to get a new one
          if (!reg.active) {
            if (retries > 0) {
              // console.debug(
              //   `No active worker after redundancy, retrying registration (${retries} left)`
              // );
              return _registerReplSW(retries - 1);
            }
            console.warn('Max retries reached, not attempting to re-register service worker');
            return null;
          }
        }
      });
    });

    // If there's already an active worker, we're good.
    if (reg.active) {
      // console.debug('Qwik REPL service worker active');
      return reg;
    }

    // If worker is waiting (installed but not activated), return registration and let
    // the SW decide activation (skipWaiting in the SW) or the page handle it.
    if (reg.waiting) {
      // console.debug('Qwik REPL service worker waiting');
      try {
        // Ask the waiting worker to skip waiting so it can activate immediately.
        reg.waiting.postMessage?.({ type: 'SKIP_WAITING' });
      } catch (e) {
        // ignore
      }

      // Wait for the new worker to take control before resolving; this prevents
      // the page from reloading too early and creating redundant workers.
      await new Promise<void>((resolve) => {
        const onControllerChange = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      });

      return reg;
    }

    // If worker is currently installing, wait for it to become activated (or redundant).
    if (reg.installing) {
      await new Promise<void>((resolve) => {
        const installing = reg.installing!;
        installing.addEventListener('statechange', function listener(ev: any) {
          const state = ev?.target?.state;
          // console.debug('Qwik REPL service worker installing state (wait): %s', state);
          if (state === 'activated' || state === 'redundant') {
            installing.removeEventListener('statechange', listener as any);
            resolve();
          }
        });
      });
      return reg;
    }

    // Fallback: wait until a service worker is ready for this scope.
    const readyReg = await navigator.serviceWorker.ready;
    return readyReg;
  } catch (err) {
    console.error('Qwik REPL service worker registration failed:', err);
    return null;
  }
};
export const registerReplSW = () => {
  if (
    typeof window === 'undefined' ||
    !('navigator' in window) ||
    !('serviceWorker' in navigator)
  ) {
    return Promise.resolve(null);
  }
  return (promise ||= _registerReplSW());
};
