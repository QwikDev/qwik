import { component$, Host } from '@builder.io/qwik';
import { useLocation } from '~qwik-city-runtime';

export default component$(() => {
  const { pathname, params } = useLocation();

  return (
    <Host>
      <h1>Blog: {params.slug}</h1>
      <p>Pathname: {pathname}</p>
    </Host>
  );
});
