import { component$ } from '@qwik.dev/core';
import type { RequestHandler } from '@qwik.dev/router';

// Throws so the nearest error boundary (error@narrow) renders.
export const onGet: RequestHandler = ({ error }) => {
  throw error(500, 'boom');
};

export default component$(() => <div>unreachable</div>);
