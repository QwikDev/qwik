import { component$, useSignal } from '@qwik.dev/core';
import { StyledCard } from './styled-card';

export default component$(() => {
  const isShown = useSignal(false);
  return (
    <section class="fixture" data-fixture="scoped-styles/scoped-styles">
      <h2>scoped styles</h2>
      <button data-testid="trigger" onClick$={() => (isShown.value = true)}>
        Show
      </button>
      {isShown.value && <StyledCard />}
    </section>
  );
});
