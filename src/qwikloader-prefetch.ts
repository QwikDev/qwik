import type { QwikLoaderMessage } from './qwikloader';

addEventListener('message', (ev: QwikLoaderMessage) =>
  // received a message from the main-thread to prefetch
  // urls so we can prime the browser cache ahead of time
  ev.data.split('\n').map((url) => fetch(url))
);
