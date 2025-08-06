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
  } else {
    // eslint-disable-next-line no-console
    console.log('Service worker not supported in this browser.');
  }
})();
