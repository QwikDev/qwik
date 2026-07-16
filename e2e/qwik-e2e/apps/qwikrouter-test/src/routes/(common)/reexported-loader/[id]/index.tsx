import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { useReexportedLoader } from './data';

export default component$(() => {
  const data = useReexportedLoader();

  return (
    <main>
      <p id="reexported-loader-id">id: {data.value.id}</p>
      <Link id="reexported-loader-one" href="/qwikrouter-test/reexported-loader/one/">
        one
      </Link>
      <Link id="reexported-loader-two" href="/qwikrouter-test/reexported-loader/two/">
        two
      </Link>
    </main>
  );
});
