/* eslint-disable no-console */

import { requestHandler } from './request-handler';
import { update } from './update';

self.onmessage = (ev: MessageEvent) => {
  if (ev.data?.type === 'update') {
    update(ev.data.version, ev.data.options);
  }
};

self.onfetch = requestHandler;

self.oninstall = () => self.skipWaiting();

self.onactivate = () => self.clients.claim();

export interface QwikWorkerGlobal {
  onmessage: (ev: MessageEvent) => void;
  onfetch: (ev: FetchEvent) => void;
  oninstall: () => void;
  onactivate: () => void;
  skipWaiting: () => void;
  clients: {
    claim: () => void;
  };
  qwikCore: typeof import('@builder.io/qwik');
  qwikOptimizer: typeof import('@builder.io/qwik/optimizer');
  qwikServer: typeof import('@builder.io/qwik/server');
  prettier: typeof import('prettier');
  prettierPlugins: any;
  rollup: typeof import('rollup');
  Terser: typeof import('terser');
}

declare const self: QwikWorkerGlobal;
