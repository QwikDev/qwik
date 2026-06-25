import { component$ } from '@qwik.dev/core';
import { useHttpStatus } from '@qwik.dev/router';

// error@narrow → the error boundary renders inside the `narrow` named layout (override chain).
export default component$(() => {
  const { status } = useHttpStatus();
  return <h1 data-error-narrow="">Caught {status}</h1>;
});
