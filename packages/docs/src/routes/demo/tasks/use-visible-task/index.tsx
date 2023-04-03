import {
  component$,
  useSignal,
  useVisibleTask$,
  type Signal,
} from '@builder.io/qwik';

export default component$(() => {
  const isClockRunning = useSignal(false);

  return (
    <>
      <div style="position: sticky; top:0">
        Scroll to see clock. (Currently clock is
        {isClockRunning.value ? ' running' : ' not running'}.)
      </div>
      <div style="height: 200vh" />
      <Clock isRunning={isClockRunning} />
    </>
  );
});

const Clock = component$<{ isRunning: Signal<boolean> }>(({ isRunning }) => {
  const time = useSignal('paused');
  useVisibleTask$(({ cleanup }) => {
    isRunning.value = true;
    const update = () => (time.value = new Date().toLocaleTimeString());
    const id = setInterval(update, 1000);
    cleanup(() => clearInterval(id));
  });
  return <div>{time}</div>;
});
