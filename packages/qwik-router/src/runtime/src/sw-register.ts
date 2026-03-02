// Source for what becomes innerHTML to the <ServiceWorkerRegister/> script

(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('__url').catch((e) => console.error(e));
    // We need to delete the cache since we are using modulepreload by default in qwik 1.14 and above
    if ('caches' in window) {
      caches
        .keys()
        .then((names) => {
          const cacheName = names.find((name) => name.startsWith('QwikBuild'));
          if (cacheName) {
            caches.delete(cacheName).catch(console.error);
          }
        })
        .catch(console.error);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('Service worker not supported in this browser.');
  }
})();
