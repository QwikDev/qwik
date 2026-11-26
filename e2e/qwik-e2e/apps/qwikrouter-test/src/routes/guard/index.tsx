import { $, component$, useSignal } from '@qwik.dev/core';
import { Link, useNavigate } from '@qwik.dev/router';

export default component$(() => {
  const loginOpen = useSignal(false);
  const nav = useNavigate();
  const membersPath = '/qwikrouter-test/guard/members/';

  return (
    <>
      <Link
        href={membersPath}
        onClick$={() => {
          loginOpen.value = true;
        }}
        onBeforeNavigate$={$(() => false)}
      >
        Members
      </Link>
      <Link href={membersPath}>Unprotected members</Link>
      <Link
        href={membersPath}
        onClick$={$(async () => {
          await nav(membersPath);
        })}
      >
        Members with guarded navigation
      </Link>
      {loginOpen.value && <p>Log in first</p>}
    </>
  );
});
