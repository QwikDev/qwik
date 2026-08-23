import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <div>
      <h1>Welcome to Qwik Router!</h1>
      <p>
        <a href="/qwikrouter-test.prod/server-function">Server Function</a>
      </p>
      <p>
        <Link id="prod-loader-link" href="/qwikrouter-test.prod/loaders/child/">
          Loaders
        </Link>
      </p>
    </div>
  );
});
