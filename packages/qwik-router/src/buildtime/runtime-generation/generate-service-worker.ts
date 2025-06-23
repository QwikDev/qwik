import type { BuildContext } from '../types';

export function generateServiceWorkerRegister(ctx: BuildContext, swRegister: string) {
  let swReg: string;

  if (ctx.isDevServer) {
    swReg = SW_UNREGISTER;
  } else {
    swReg = swRegister;

    let swUrl = '/service-worker.js';
    if (ctx.serviceWorkers.length > 0) {
      const sw = ctx.serviceWorkers.sort((a, b) =>
        a.chunkFileName.length < b.chunkFileName.length ? -1 : 1
      )[0];
      swUrl = ctx.opts.basePathname + sw.chunkFileName;
    }

    swReg = swReg.replace('__url', swUrl);
  }

  return `export default ${JSON.stringify(swReg)};`;
}

const SW_UNREGISTER = `
navigator.serviceWorker?.getRegistrations().then((regs) => {
  for (const reg of regs) {
    reg.unregister();
  }
});
`;
