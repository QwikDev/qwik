import { jsx } from '@builder.io/qwik';
import swRegister from '@qwik-city-sw-register';

/**
 * @alpha
 */
export const ServiceWorkerRegister = () => jsx('script', { dangerouslySetInnerHTML: swRegister });
