import { component$ } from '@qwik.dev/core';

export default component$(() => {
  return (
    <main>
      <Greeter salutation="Hello" name="World" />
    </main>
  );
});

interface GreeterProps {
  salutation: string;
  name: string;
}
export const Greeter = component$((props: GreeterProps) => {
  return (
    <p>
      {props.salutation} {props.name}!
    </p>
  );
});
