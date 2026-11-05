import { component$ } from '@qwik.dev/core';
import { Link, useNavigate } from '@qwik.dev/router';

export default component$(() => {
  const nav = useNavigate();
  return (
    <div>
      <h1 id="loader-redirect-home">Loader Redirect Home</h1>
      <Link
        id="loader-redirect-list-link"
        href="/qwikrouter-test/loader-redirect/list/"
        prefetch={false}
      >
        List
      </Link>
      {[
        { kind: 'object', search: '?sort=old' },
        { kind: 'undefined', search: '?kind=undefined&sort=undefined' },
      ].map(({ kind, search }) => (
        <Link
          key={kind}
          id={`loader-redirect-${kind}-link`}
          href={`/qwikrouter-test/loader-redirect/list/${search}`}
          prefetch={false}
        >
          {kind}
        </Link>
      ))}
      <button
        id="loader-redirect-btn"
        onClick$={() => {
          nav('/qwikrouter-test/loader-redirect/source/?redirect');
        }}
      >
        Navigate to source with redirect
      </button>
    </div>
  );
});
