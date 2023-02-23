import { component$, JSXNode, Slot } from '@builder.io/qwik';

export interface GroupLinkProps {
  link: string;
  socialLogo?: JSXNode;
}

export const GroupLink = component$((props: GroupLinkProps) => {
  return (
    <a href={props.link}>
      <Slot name="socialLogo" /> <Slot />
    </a>
  );
});
