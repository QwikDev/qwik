import { component$ } from '@qwik.dev/core';
import { ThirdPartyPaymentComponent } from './third-party-library';

// As mentioned, here we are re-exporting the third-party loader
export { useThirdPartyPaymentLoader } from './third-party-library';

export default component$(() => {
  return (
    <section>
      <ThirdPartyPaymentComponent />
    </section>
  );
});
