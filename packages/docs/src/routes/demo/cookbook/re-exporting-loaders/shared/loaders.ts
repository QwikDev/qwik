import { routeAction$, routeLoader$ } from '@qwik.dev/router';

export const useCommonRouteAction = routeAction$(async () => {
  // ...
  return { success: true, data: ['Qwik', 'Partytown'] };
});

export const useCommonRouteLoader = routeLoader$(async () => {
  // ...
  return ['Mitosis', 'Builder.io'];
});
