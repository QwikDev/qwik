import { component$, Host } from '@builder.io/qwik';
import { useLocation } from 'packages/qwik-city/runtime';

export default component$(() => {
  const loc = useLocation();

  return (
    <Host>
      <h1>Docs</h1>
      <p>pathname: {loc.pathname}</p>
      <p>category: {loc.routeParams.category}</p>
      <p>id: {loc.routeParams.id}</p>
    </Host>
  );
});
