import { routeLoader$ } from '@qwik.dev/router';

export const useReexportedLoader = routeLoader$(({ params }) => ({
  id: params.id,
}));
