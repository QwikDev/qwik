import { jsx, useSignal } from '@qwik.dev/core';

export function App() {
  const show = useSignal(false);
  // jsx() is JSX written as a call: the runtime export only throws, so it must compile like syntax
  return (
    <div>
      {show.value ? jsx('p', { children: 'shown' }) : jsx('p', { dangerouslySetInnerHTML: 'raw' })}
    </div>
  );
}
