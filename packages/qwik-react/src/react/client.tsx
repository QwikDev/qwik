/** @jsxImportSource @emotion/react */
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';

const key = 'css';
const cache = createCache({ key });

const Cmp = ({ Cmp, ev, ...props }: any) => {
  return (
    <CacheProvider value={cache}>
      <Cmp {...props} />
    </CacheProvider>
  );
};

export const Main = (cmp: any, props: any, event?: any) => {
  return <Cmp Cmp={cmp} event={event} {...props} />;
};

export { createElement } from 'react';
export { createRoot, hydrateRoot } from 'react-dom/client';
