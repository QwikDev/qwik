// Source for what becomes innerHTML to the <ServiceWorkerRegister/> script

(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        const url = '__url'.split('/').pop();
        if (reg.active?.scriptURL.endsWith(url || 'service-worker.js')) {
          reg.unregister().catch(console.error);
        }
      }
    });
  }
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
})();
