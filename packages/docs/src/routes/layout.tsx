import type { RequestHandler } from '@qwik.dev/router';
import { component$, Slot } from '@qwik.dev/core';
import { setReplCorsHeaders } from '~/utils/utils';

export default component$(() => {
  return <Slot />;
});

export const onGet: RequestHandler = ({ cacheControl, headers }) => {
  // cache for pages using this layout
  cacheControl({
    public: true,
    maxAge: 3600,
  });
  setReplCorsHeaders(headers);
};
