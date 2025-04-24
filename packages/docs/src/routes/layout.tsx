import { component$, Slot } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';

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
