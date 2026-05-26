import { component$ } from '@qwik.dev/core';

export type DemoModeName = 'cached' | 'mock-loading';

export type DemoMode = {
  mode: DemoModeName;
  run: string;
  runId: string;
  delayMs: number;
  title: string;
  summary: string;
  query: string;
};

export const readDemoMode = (url: URL, scope: string): DemoMode => {
  const mode: DemoModeName =
    url.searchParams.get('demo') === 'mock-loading' ? 'mock-loading' : 'cached';
  const run = url.searchParams.get('run') || (mode === 'cached' ? 'stable' : 'cold');
  const delayMs = readDelay(url.searchParams.get('delay'), mode === 'mock-loading' ? 900 : 0);

  return {
    mode,
    run,
    runId: `${scope}:${mode}:${run}`,
    delayMs,
    title: mode === 'mock-loading' ? 'Mock loading' : 'Cached',
    summary:
      mode === 'mock-loading'
        ? 'Slow, unique inputs. Change the run query value to force a fresh cache miss.'
        : 'Stable inputs. Reload this URL twice to see cache hits reuse server results.',
    query: `demo=${mode}&run=${encodeURIComponent(run)}&delay=${delayMs}`,
  };
};

export const demoHref = (
  port: number,
  mode: DemoModeName,
  run: string,
  delayMs = mode === 'mock-loading' ? 900 : 0
) => {
  const params = new URLSearchParams({
    demo: mode,
    run,
    delay: String(delayMs),
  });
  return `http://127.0.0.1:${port}/?${params}`;
};

export const DemoModePanel = component$((props: { demo: DemoMode; port: number }) => {
  const nextRun = `${props.demo.mode}-${Date.now().toString(36)}`;

  return (
    <section class="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Query controlled demo mode
          </p>
          <h2 class="m-0 text-2xl font-black">{props.demo.title}</h2>
          <p class="mb-0 mt-2 max-w-2xl text-sm leading-6 text-slate-600">{props.demo.summary}</p>
        </div>
        <code class="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          ?{props.demo.query}
        </code>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <a
          class="rounded-md bg-slate-800 px-3.5 py-2.5 text-sm font-bold text-white no-underline"
          href={demoHref(props.port, 'mock-loading', nextRun, 900)}
        >
          Mock loading URL
        </a>
        <a
          class="rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 no-underline"
          href={demoHref(props.port, 'cached', 'stable', 0)}
        >
          Cached URL
        </a>
      </div>
    </section>
  );
});

const readDelay = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(2000, Math.round(parsed)));
};
