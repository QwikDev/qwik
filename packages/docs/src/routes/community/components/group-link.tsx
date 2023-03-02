import { component$, Slot, useStylesScoped$ } from '@builder.io/qwik';

export interface GroupLinkProps {
  link: string;
}

export const GroupLink = component$((props: GroupLinkProps) => {
  useStylesScoped$(`
    :global(.docs article) a {
      color: var(--secondary-text-color);
    }`);
  return (
    <a href={props.link} target="_blank" rel="noopener">
      <Slot />
    </a>
  );
});
