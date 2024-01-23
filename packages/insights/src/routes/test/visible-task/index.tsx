import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';

export default component$(() => {
  const time = useSignal('loading...');
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const update = () => (time.value = new Date().toLocaleTimeString());
    update();
    cleanup(clearInterval.bind(null, setInterval(update, 1000)));
  });
  return <div>Time: {time.value}</div>;
});
