import { routeLoader$ } from '@qwik.dev/router';

// Re-exported by `routes/custom-id-prefetch/reexported/` with `export { useReexported }`.
export const useReexported = routeLoader$(() => ({ title: 'Re-exported target' }), {
  id: 'custom-id-reexported',
});
