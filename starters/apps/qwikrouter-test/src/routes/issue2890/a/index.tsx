import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";

export default component$(() => {
  return (
    <div>
      <div>
        <Link id="issue2890-link-0" href="/qwikrouter-test/issue2890/b/">
          /b/
        </Link>
      </div>
      <div>
        <Link
          id="issue2890-link-1"
          href="/qwikrouter-test/issue2890/b/?query=123"
        >
          /b/?query=123
        </Link>
      </div>
      <div>
        <Link
          id="issue2890-link-2"
          href="/qwikrouter-test/issue2890/b?query=321"
        >
          /b?query=321
        </Link>
      </div>
      <div>
        <Link
          id="issue2890-link-3"
          href="/qwikrouter-test/issue2890/b/?query=321&hash=true#h2"
        >
          /b/?query=321&hash=true#h2
        </Link>
      </div>
      <div>
        <Link
          id="issue2890-link-4"
          href="/qwikrouter-test/issue2890/b?query=321&hash=true#h2"
        >
          /b?query=321&hash=true#h2
        </Link>
      </div>
    </div>
  );
});
