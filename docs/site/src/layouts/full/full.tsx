import { $, component$, Host } from '@builder.io/qwik';

export interface FullProps {
  content: string;
  children: any;
}

const Full = component$((props: FullProps) => {
  return $(() => (
    <Host class="docs">
      {props.content}
      {props.children}
    </Host>
  ));
});

export default Full;
