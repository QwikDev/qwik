import { routeLoader$ } from '@qwik.dev/router';

export const createDynamicSession = () => ({
  useDynamicSession: routeLoader$(({ sharedMap }) => sharedMap.get('qwik-prod-session')),
});
