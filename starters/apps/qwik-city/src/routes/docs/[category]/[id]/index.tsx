import { component$, Host } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';

export default component$(() => {
  const loc = useLocation();

  return (
    <Host>
      <h1>Docs</h1>
      <p>pathname: {loc.pathname}</p>
      <p>category: {loc.params.category}</p>
      <p>id: {loc.params.id}</p>
    </Host>
  );
});
