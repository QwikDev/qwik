import { component$ } from '@qwik.dev/core';
import { useNavigate } from '@qwik.dev/router';

export const NavButton = component$(() => {
  const nav = useNavigate();
  return (
    <section class="fixture" data-fixture="navigation/from-nav">
      <h2>navigation, nav() from a button</h2>
      <button data-testid="nav-tree" onClick$={() => nav('/navigation/to-tree/')}>
        To a tree page
      </button>
    </section>
  );
});
