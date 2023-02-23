import { component$, Slot, useStyles$ } from '@builder.io/qwik';

export interface GroupLinkProps {
  link: string;
}

export const CSS = `
  .docs article a.group-link {
    color: var(--secondary-text-color);
  }
`

export const GroupLink = component$((props: GroupLinkProps) => {
  useStyles$(CSS);
  return (
    <a class="group-link" href={props.link} target="_blank">
      <Slot />
    </a>
  );
});
