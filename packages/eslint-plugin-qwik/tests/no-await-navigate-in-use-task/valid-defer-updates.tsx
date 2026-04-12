import { component$, useTask$ } from '@builder.io/qwik';
import { useNavigate } from '@builder.io/qwik-city';

export default component$(() => {
  const nav = useNavigate();
  useTask$(
    async () => {
      await nav('/');
    },
    { deferUpdates: false },
  );
  return <div />;
});
