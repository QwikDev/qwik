import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <div id="loader-failures-index">
      <Link id="to-blocking-crash" href="/qwikrouter-test/loader-failures/blocking-crash/">
        blocking crash
      </Link>
      <Link
        id="to-streamed-http-error"
        href="/qwikrouter-test/loader-failures/streamed-http-error/"
      >
        streamed HttpError
      </Link>
    </div>
  );
});
