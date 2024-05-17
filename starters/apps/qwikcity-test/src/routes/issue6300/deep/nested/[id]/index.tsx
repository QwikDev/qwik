import { useLocation } from '@builder.io/qwik-city';
import { component$ } from '@builder.io/qwik';

export default component$(() => {
  const { url } = useLocation();

  return <div>Working nesting with ID {url.pathname}</div>;
});
