import { component$, Slot } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';

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
