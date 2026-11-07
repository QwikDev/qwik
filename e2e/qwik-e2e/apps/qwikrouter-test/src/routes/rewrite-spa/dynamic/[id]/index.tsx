import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';

export default component$(() => {
  const { params } = useLocation();
  return <p id="rewrite-spa-dynamic">{params.id}</p>;
});
