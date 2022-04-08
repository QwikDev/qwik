import { component$, Host } from '@builder.io/qwik';

export interface TutorialProps {
  pathname: string;
}

const Tutorial = component$((props: TutorialProps) => {
  return <Host class="tutorial">tutorial: {props.pathname}</Host>;
});

export default Tutorial;
