import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <>
      <Link id="subpage-link" href="/loaders/subpage">
        Sub page
      </Link>
    </>
  );
});
