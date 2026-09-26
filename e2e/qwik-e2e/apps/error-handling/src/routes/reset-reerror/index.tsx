import { component$, Catch, isServer, Pending, type JSXOutput } from '@qwik.dev/core';
import { CatchReErrorAsync, resetFallback } from '../../components/catch/catch';

export default component$(() => (
  <Pending fallback={<span id="catch-skel">loading</span>}>
    <Catch fallback$={resetFallback}>
      <CatchReErrorAsync />
    </Catch>
  </Pending>
));
