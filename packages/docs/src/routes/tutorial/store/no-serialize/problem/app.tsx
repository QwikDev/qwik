import { component$, type NoSerialize, useStore } from '@builder.io/qwik';

interface AppStore {
  time: null | string;
  cleanup: NoSerialize<() => void>;
}
export default component$(() => {
  const store = useStore<AppStore>({
    time: null,
    cleanup: undefined,
  });
  return (
    <>
      <p>Current Time: {store.time}</p>
      <button
        onClick$={() => {
          // @ts-ignore
          const id = setInterval(() => (store.time = new Date().toString()), 1000);
          // assign a cleanup function to: store.cleanup
        }}
      >
        start
      </button>
      <button
        onClick$={() => {
          store.cleanup && store.cleanup();
          store.cleanup = undefined;
        }}
      >
        stop
      </button>
    </>
  );
});
