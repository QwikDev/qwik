import { Slot } from '@qwik.dev/core';

export function App() {
  function Inner() {
    return (
      <div>
        <Slot />
      </div>
    );
  }
  function Wrapper() {
    return (
      <Inner>
        <Slot />
      </Inner>
    );
  }
  return <Wrapper />;
}
