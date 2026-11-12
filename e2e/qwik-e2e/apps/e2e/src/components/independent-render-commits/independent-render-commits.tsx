import { component$, isServer, useSignal } from '@qwik.dev/core';

function recordRender(name: string) {
  if (!isServer) {
    (globalThis as any).__independentRenderCommit.order.push(name);
  }
}

const Counter = component$<{ value: number }>(({ value }) => {
  const count = Number(value);
  recordRender('counter');
  return <span id="independent-count">{count}</span>;
});

const Gated = component$<{ value: number; id: string }>(({ value, id }) => {
  const count = Number(value);
  recordRender('toast');
  if (!count) {
    return <span id={id}>old toast</span>;
  }
  const gate = (globalThis as any).__independentRenderCommit;
  gate.entered = true;
  return gate.wait.then(() => <span id={id}>toast {count}</span>);
});

const Tail = component$<{ value: number }>(({ value }) => {
  const count = Number(value);
  recordRender('tail');
  return <span id="independent-tail">{count}</span>;
});

const Updates = component$(() => {
  const count = useSignal(0);
  const value = count.value;
  recordRender('parent');
  return (
    <section>
      <button id="independent-update" onClick$={() => count.value++}>
        update
      </button>
      <Counter value={value} />
      <Gated value={value} id="independent-toast" />
      <Tail value={value} />
    </section>
  );
});

const NextPage = component$(() => (
  <section id="independent-new-page">
    <h1>new page</h1>
    <Gated value={1} id="independent-navigation-ready" />
  </section>
));

export const IndependentRenderCommits = component$(() => {
  const visible = useSignal(true);
  const next = useSignal(false);
  const shown = visible.value;
  const navigated = next.value;
  return (
    <div>
      <button id="independent-remove" onClick$={() => (visible.value = false)}>
        remove
      </button>
      <button id="independent-navigate" onClick$={() => (next.value = true)}>
        navigate
      </button>
      {navigated ? (
        <NextPage />
      ) : (
        <>
          <main id="independent-old-page">old page</main>
          {shown ? <Updates /> : <p id="independent-removed">removed</p>}
        </>
      )}
    </div>
  );
});
