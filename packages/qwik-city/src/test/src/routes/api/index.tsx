import { component$, Host, useClientEffect$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ timestamp: 0 });

  useClientEffect$(async (track) => {
    track(store, 'timestamp');

    const url = `/api/builder.io/oss.json`;
    const rsp = await fetch(url);
    const data = await rsp.json();
    store.timestamp = data.timestamp;
  });

  return (
    <Host>
      <p>Timestamp: {store.timestamp}</p>
    </Host>
  );
});
