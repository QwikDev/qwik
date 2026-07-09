import { component$ } from '@qwik.dev/core';
import { EagerTransitiveGenerator } from '~/shared/eager-transitive-generator';

export default component$(() => {
  return (
    <div>
      <EagerTransitiveGenerator />
    </div>
  );
});
