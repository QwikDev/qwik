import { component$ } from '@builder.io/qwik';
import swRegistration from '@qwik-city-sw-registration';

/**
 * @alpha
 */
export const ServiceWorker = component$((props?: ServiceWorkerProps) => {
  const url = props?.url || '/sw.js';
  const swReg = swRegistration.replace('_url', url);
  return <script dangerouslySetInnerHTML={swReg} />;
});

export interface ServiceWorkerProps {
  url?: string;
}
