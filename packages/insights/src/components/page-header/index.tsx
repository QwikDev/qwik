import { Slot, component$ } from '@qwik.dev/core';

export default component$<{
  class?: string;
  description: string;
  eyebrow: string;
  title: string;
}>(({ class: className, description, eyebrow, title }) => (
  <header
    class={['flex flex-col gap-editorial-6 md:flex-row md:items-end md:justify-between', className]}
  >
    <div>
      <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
        {eyebrow}
      </p>
      <h1 class="mt-editorial-2 text-editorial-44 font-bold leading-[1.1] tracking-[-0.035em]">
        {title}
      </h1>
      <p class="mt-editorial-2 max-w-3xl text-editorial-14 text-editorial-secondary">
        {description}
      </p>
    </div>
    <Slot />
  </header>
));
