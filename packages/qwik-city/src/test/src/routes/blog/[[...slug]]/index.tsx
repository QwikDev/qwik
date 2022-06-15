import { component$, Host } from '@builder.io/qwik';
import { useRoute } from '@builder.io/qwik-city';

export default component$(() => {
  const route = useRoute();

  return (
    <Host>
      <h1>Blog {route.pathname}</h1>
      <p>Slug: {route.params.slug}</p>
    </Host>
  );
});
