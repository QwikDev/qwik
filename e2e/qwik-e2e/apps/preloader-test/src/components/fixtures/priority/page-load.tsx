import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export default component$(() => {
  const seen = useSignal(0);
  const clicks = useSignal(0);

  useVisibleTask$(() => {
    seen.value = 1;
  });

  return (
    <section class="fixture" data-fixture="priority">
      <h2>hero image, visible task and button in view</h2>
      <img src="/priority-hero.png" width={600} height={300} alt="" />
      <output data-testid="result" data-done={seen.value ? '' : undefined}>
        {seen.value}
      </output>
      <button data-testid="trigger" onClick$={() => clicks.value++}>
        click
      </button>
      <output data-testid="clicks">{clicks.value}</output>
    </section>
  );
});
