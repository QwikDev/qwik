import { component$, Slot } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <>
      <Link data-testid="qwik-link" href="/">
        qwik
      </Link>
      <Link data-testid="react-link" href="/react">
        react
      </Link>
      <br />
      <main>
        <Slot />
      </main>
    </>
  );
});
