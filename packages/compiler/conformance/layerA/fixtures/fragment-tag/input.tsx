import { Fragment, useSignal } from '@qwik.dev/core';

// an explicit <Fragment> tag lowers as a fragment, never as a component call
export function App() {
  const count = useSignal(2);
  return (
    <main>
      {Array.from({ length: count.value }).map((_, i) => (
        <Fragment key={i}>
          <span class="a">A{i}</span>
          <span class="b">B{i}</span>
        </Fragment>
      ))}
    </main>
  );
}
