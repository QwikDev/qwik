import { component$, Slot, useStylesScoped$ } from '@builder.io/qwik';

export interface GroupLinkProps {
  link: string;
}

export const CSS = `
  .docs article a {
    color: var(--secondary-text-color);
  }
`;

export const GroupLink = component$((props: GroupLinkProps) => {
  useStylesScoped$(CSS);
  return (
    <a href={props.link} target="_blank" rel="noopener">
      <Slot />
    </a>
  );
});
