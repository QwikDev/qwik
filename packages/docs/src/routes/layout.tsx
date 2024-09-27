import type { RequestHandler } from '@qwikdev/city';
import { component$, Slot } from '@qwikdev/core';

export default component$(() => {
  return <Slot />;
});

export const onGet: RequestHandler = ({ cacheControl }) => {
  // cache for pages using this layout
  cacheControl({
    public: true,
    maxAge: 3600,
    sMaxAge: 3600,
    staleWhileRevalidate: 86400,
  });
};
