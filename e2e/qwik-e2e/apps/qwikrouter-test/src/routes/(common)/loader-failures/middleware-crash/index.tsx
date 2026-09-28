import { component$ } from '@qwik.dev/core';
import { type RequestHandler } from '@qwik.dev/router';

export const onRequest: RequestHandler = () => {
  throw new Error('middleware boom');
};

export default component$(() => {
  return <p>This should never render</p>;
});
