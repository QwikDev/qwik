import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { glossaryEntries } from '~/components/glossary/glossary.data';

export default component$(() => {
  return (
    <article class="mx-auto max-w-3xl px-4 py-12">
      <h1 class="text-3xl font-bold">Glossary</h1>
      <p class="mt-2 text-foreground-base">
        Definitions for the terms used across the Qwik documentation.
      </p>
      {glossaryEntries.map(([id, entry]) => (
        <section key={id} id={id} class="mt-8 scroll-mt-24">
          <h2 class="text-xl font-semibold">{entry.display}</h2>
          <p class="mt-2 text-foreground-base">{entry.short}</p>
        </section>
      ))}
    </article>
  );
});

export const head: DocumentHead = {
  title: 'Glossary | Qwik',
  meta: [
    {
      name: 'description',
      content: 'Definitions of the key terms used in the Qwik documentation.',
    },
  ],
};
