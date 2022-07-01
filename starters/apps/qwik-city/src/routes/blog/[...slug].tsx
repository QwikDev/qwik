import { component$, Host } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';

export default component$(() => {
  const { pathname, params } = useLocation();

  return (
    <Host>
      <h1>Blog {pathname}</h1>
      <p>Slug: {params.slug}</p>
    </Host>
  );
});
