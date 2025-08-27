---
'@builder.io/qwik-city': patch
---

FIX: Your service-worker.js won't be unregistered anymore if you added custom logic to it. 

> Note: Qwik 1.14.0 and above now use `<link rel="modulepreload">` by default. If you didn't add custom service-worker logic, you should remove your service-worker.ts file(s) for the `ServiceWorkerRegister` Component to actually unregister the service-worker.js and delete its related cache. Make sure to keep the `ServiceWorkerRegister` Component in your app (without any service-worker.ts file) as long as you want to unregister the service-worker.js for your users.
