// Source for what becomes innerHTML to the <ServiceWorkerRegister/> script

(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('__url').catch((e) => console.error(e));
  } else {
    // eslint-disable-next-line no-console
    console.log('Service worker not supported in this browser.');
  }
})();
