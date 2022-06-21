/** @jsxImportSource react */
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';

const key = 'css';
const cache = createCache({ key });

function Cmp({ Cmp, ev, ...props }: any) {
  return (
    <CacheProvider value={cache}>
      <Cmp {...props} />
    </CacheProvider>
  );
}

export function Main(cmp: any, props: any, event?: any) {
  return <Cmp Cmp={cmp} event={event} {...props} />;
}

export { createElement } from 'react';
export { createRoot, hydrateRoot } from 'react-dom/client';
