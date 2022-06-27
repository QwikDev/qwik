/** @jsxImportSource @emotion/react */

import { CacheProvider } from '@emotion/react';
import { renderToString } from 'react-dom/server';
import createEmotionServer from '@emotion/server/create-instance';
import createCache from '@emotion/cache';
export { createElement } from 'react';
export { renderToString } from '@builder.io/qwik/server';

const key = 'css';
const cache = createCache({ key });
export const { extractCriticalToChunks, constructStyleTagsFromChunks } = createEmotionServer(cache);

export function getGlobalStyleTag(html: string) {
  const chunks = extractCriticalToChunks(html);
  const style = constructStyleTagsFromChunks(chunks);
  return style;
}

export function render(App: any, props: any) {
  const html = renderToString(
    <CacheProvider value={cache}>
      <App {...props} />
    </CacheProvider>
  );

  return html;
}
