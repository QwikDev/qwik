import { useSignal } from '@qwik.dev/core';

export function App() {
  const count = useSignal(2);
  function Badge(props: { label: string; kind: string }) {
    return (
      <b class={props.kind}>
        {props.label}
        {count.value}
      </b>
    );
  }
  return (
    <div>
      <Badge label="hi" kind="tag" />
    </div>
  );
}
