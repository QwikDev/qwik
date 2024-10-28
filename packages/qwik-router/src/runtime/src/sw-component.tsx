import swRegister from '@qwik-router-sw-register';
import { jsx } from '@qwik.dev/core';

/** @public */
export const ServiceWorkerRegister = (props: { nonce?: string }) =>
  jsx('script', { dangerouslySetInnerHTML: swRegister, nonce: props.nonce });
