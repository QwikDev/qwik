import { component$, useTask$ } from '@builder.io/qwik';
import { useNavigate } from '@builder.io/qwik-city';

export default component$(() => {
  const nav = useNavigate();
  const other = async () => Promise.resolve();
  useTask$(async () => {
    await other();
    void nav('/');
  });
  return <div />;
});
