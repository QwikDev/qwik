import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => (
  <Link id="to-loader-error" href="/error-handling/loader-error-inline/">
    go to erroring loader
  </Link>
));
