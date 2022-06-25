import { component$, Host } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';

export default component$(() => {
  const loc = useLocation();

  return (
    <Host>
      <h1>Blog {loc.pathname}</h1>
      <p>Slug: {loc.routeParams.slug}</p>
    </Host>
  );
});
