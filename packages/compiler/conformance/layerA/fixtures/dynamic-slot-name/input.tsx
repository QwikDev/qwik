import { Slot, useSignal } from '@qwik.dev/core';

export function Switch(props: { pick: string }) {
  return (
    <section>
      <Slot name={props.pick} />
    </section>
  );
}

export function App() {
  const pick = useSignal('b');
  return (
    <Switch pick={pick.value}>
      <p q:slot="a">alpha</p>
      <p q:slot="b">bravo</p>
    </Switch>
  );
}
