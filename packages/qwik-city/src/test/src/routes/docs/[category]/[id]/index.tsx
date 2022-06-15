import { component$, Host } from '@builder.io/qwik';
import { useRoute } from '@builder.io/qwik-city';

export default component$(() => {
  const route = useRoute();

  return (
    <Host>
      <h1>
        Docs: {route.params.category} {route.params.id}
      </h1>
    </Host>
  );
});
