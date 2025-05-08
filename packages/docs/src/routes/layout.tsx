import type { RequestHandler } from '@qwik.dev/router';
import { component$, Slot } from '@qwik.dev/core';

export default component$(() => {
  return <Slot />;
});

export const onGet: RequestHandler = ({ cacheControl }) => {
  // cache for pages using this layout
  cacheControl({
    public: true,
    maxAge: 3600,
  });
};
