import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <div id="loader-failures-index">
      <Link
        id="to-blocking-http-error"
        href="/qwikrouter-test/loader-failures/blocking-http-error/"
      >
        blocking HttpError
      </Link>
      <Link
        id="to-middleware-http-error"
        href="/qwikrouter-test/loader-failures/middleware-http-error/"
      >
        middleware HttpError
      </Link>
      <Link id="to-blocking-crash" href="/qwikrouter-test/loader-failures/blocking-crash/">
        blocking crash
      </Link>
      <Link
        id="to-streamed-http-error"
        href="/qwikrouter-test/loader-failures/streamed-http-error/"
      >
        streamed HttpError
      </Link>
      <Link id="to-middleware-refresh" href="/qwikrouter-test/loader-failures/middleware-refresh/">
        middleware refresh
      </Link>
    </div>
  );
});
