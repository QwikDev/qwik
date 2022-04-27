/** @jsxImportSource react */
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { useEffect } from 'react';
export { createElement } from 'react';

export { createRoot, hydrateRoot } from 'react-dom/client';
const key = 'css';
const cache = createCache({ key });

function Cmp({ Cmp, ev, ...props }: any) {
  useEffect(() => {
    if (ev) {
      console.log('redispatch', ev);
      (ev.target as Element).dispatchEvent(ev);
    }
  });
  return (
    <CacheProvider value={cache}>
      <Cmp {...props} />
    </CacheProvider>
  );
}

export function Main(cmp: any, props: any, event?: any) {
  return <Cmp Cmp={cmp} event={event} {...props} />;
}
