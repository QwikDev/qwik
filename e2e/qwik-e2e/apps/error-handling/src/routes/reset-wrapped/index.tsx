import { component$, Catch, Pending } from '@qwik.dev/core';
import { CatchWrapAsync, CatchWrapper, resetFallback } from '../../components/catch/catch';

export default component$(() => (
  <Pending fallback={<span id="catch-skel">loading</span>}>
    <CatchWrapper>
      <Catch fallback$={resetFallback}>
        <CatchWrapAsync />
      </Catch>
    </CatchWrapper>
  </Pending>
));
