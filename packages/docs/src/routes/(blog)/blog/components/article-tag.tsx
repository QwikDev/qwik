import { component$ } from '@qwik.dev/core';

export const ArticleTag = component$<{ tag: string }>((props) => {
  return (
    <span class="px-3 py-1 mr-2 text-label-base font-semibold rounded-full bg-background-accent border-[1.6px] border-border-base text-standalone-accent">
      {props.tag}
    </span>
  );
});
