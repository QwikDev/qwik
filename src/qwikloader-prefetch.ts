import type { QwikLoaderMessage } from './qwikloader';

addEventListener('message', (ev: QwikLoaderMessage) =>
  // received a message from the main-thread to prefetch
  // urls so we can prime the browser cache ahead of time
  ev.data.map((url) => fetch(url))
);
