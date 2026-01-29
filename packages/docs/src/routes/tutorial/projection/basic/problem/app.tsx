/* eslint-disable no-console */
import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ count: 0 });
  console.log('Render: <App>');
  return (
    <Panel>
      Count: {store.count}. <button onClick$={() => store.count++}>+1</button>
    </Panel>
  );
});

export const Panel = component$(() => {
  console.log('Render: <Panel>');
  return (
    <div style={{ border: '2px solid red;', padding: '1em' }}>
      Currently the <code>&lt;Panel&gt;</code> component controls the content here. Replace this
      text with <code>&lt;Slot&gt;</code> element to see the content projected from the{' '}
      <code>&lt;App&gt;</code>.
    </div>
  );
});
