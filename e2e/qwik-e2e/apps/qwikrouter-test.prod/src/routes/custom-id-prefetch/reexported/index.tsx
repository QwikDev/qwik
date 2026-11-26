import { component$ } from '@qwik.dev/core';
import { useReexported } from '~/shared/custom-id-reexported-loader';

// Imported, then re-exported without `from` (docs: re-exporting loaders).
export { useReexported };

export default component$(() => {
  const target = useReexported();
  return <h1>{target.value.title}</h1>;
});
