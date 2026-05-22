import { component$, Suspense, useAsync$, useSignal } from '@qwik.dev/core';
import { getSharedMetric, getStressItem, type StressInput } from './stress.server';

export const StressCard = component$((props: StressInput) => {
  const expanded = useSignal(false);
  const item = useAsync$(getStressItem, props);
  const metric = useAsync$(getSharedMetric, props);

  return (
    <Suspense fallback={<article class="card muted">Loading {props.id}...</article>}>
      <article class="card">
        <div class="card-top">
          <span>{item.value.bucket}</span>
          <button onClick$={() => (expanded.value = !expanded.value)}>
            {expanded.value ? 'Hide' : 'Show'}
          </button>
        </div>
        <h2>{item.value.label}</h2>
        <p>item reads: {item.value.reads}</p>
        <p>metric score: {metric.value.score}</p>
        {expanded.value ? <small>metric reads: {metric.value.reads}</small> : null}
      </article>
    </Suspense>
  );
});

export const NestedStressPanel = component$((props: { runId: string }) => {
  return (
    <Suspense fallback={<section class="panel muted">Loading nested panel...</section>}>
      <section class="panel">
        <h2>Nested Suspense cluster</h2>
        <div class="grid small">
          <StressCard id="a" runId={props.runId} />
          <StressCard id="slow" runId={props.runId} />
          <StressCard id="a" runId={props.runId} />
        </div>
      </section>
    </Suspense>
  );
});
