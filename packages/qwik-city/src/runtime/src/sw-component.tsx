import { jsx } from '@builder.io/qwik';
import swRegister from '@qwik-city-sw-register';

/** @public */
export const ServiceWorkerRegister = (props: { nonce?: string; verbose?: boolean }) => {
  const content = props.verbose
    ? `globalThis.qwikCitySWVerbose = ${props.verbose}; ${swRegister}`
    : swRegister;
  return jsx('script', {
    dangerouslySetInnerHTML: content,
    nonce: props.nonce,
  });
};
