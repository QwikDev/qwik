import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourceArg, scenario, profileMode = 'time'] = process.argv.slice(2);
if (
  !sourceArg ||
  ![
    'plain',
    'packets',
    'packets-metadata',
    'packets-metadata-large',
    'discard',
    'fragments',
    'components',
    'components-async',
    'components-retry',
    'content',
    'content-async',
    'content-nested',
    'content-async-nested',
    'content-retry',
    'tasks',
    'computed',
    'computed-cleanups',
    'computed-async-cleanups',
    'serialization-async',
  ].includes(scenario) ||
  !['time', 'alloc'].includes(profileMode) ||
  !global.gc
) {
  throw new Error(
    'Usage: node --expose-gc scripts/benchmark-ssr-publication.mjs <source-directory> <plain|packets|packets-metadata|packets-metadata-large|discard|fragments|components|components-async|components-retry|content|content-async|content-nested|content-async-nested|content-retry|tasks|computed|computed-cleanups|computed-async-cleanups|serialization-async> [time|alloc]'
  );
}
const source = resolve(sourceArg);
const directory = await mkdtemp(join(tmpdir(), 'qwik-ssr-publication-'));
const bundle = join(directory, 'runtime.mjs');
await build({
  stdin: {
    contents: `export { Task, TaskSubscription } from ${JSON.stringify(join(source, 'packages/qwik/src/core/runtime/task.ts'))}; export { runTaskSubscriber } from ${JSON.stringify(join(source, 'packages/qwik/src/core/runtime/run-task.ts'))}; export { renderToStreamCompiled } from ${JSON.stringify(join(source, 'packages/qwik/src/server/ssr-render.ts'))}; export { createQRL, createSsrPending, createSsrCatch, useSignal, useStyles, useComputedQrl, createComponent, renderSsrContent, Computed, disposeSubscriber, Phase, SubscriberFlags } from ${JSON.stringify(join(source, 'packages/qwik/src/core/index.ts'))};`,
    resolveDir: source,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: bundle,
  minify: true,
  treeShaking: true,
  alias: {
    '@qwik.dev/core': join(source, 'packages/qwik/src/core/index.ts'),
    '@qwik.dev/core/async-local-storage': join(
      source,
      'packages/qwik/src/core/shared/platform/async-local-storage.node.ts'
    ),
    '@qwik.dev/core/preloader': join(source, 'packages/qwik/src/core/preloader/index.ts'),
  },
  define: {
    'globalThis.qDev': 'false',
    'globalThis.qTest': 'false',
    'globalThis.qInspector': 'false',
    'globalThis.qRuntimeQrl': 'false',
  },
  plugins: [
    {
      name: 'server-flags',
      setup(builder) {
        builder.onResolve({ filter: /^@qwik\.dev\/core\/build$/ }, () => ({
          path: 'flags',
          namespace: 'flags',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'flags' }, () => ({
          contents: 'export const isDev=false,isServer=true,isBrowser=false;',
          loader: 'js',
        }));
      },
    },
  ],
});
globalThis.QWIK_LOADER_DEFAULT_MINIFIED = '';
globalThis.QWIK_LOADER_DEFAULT_DEBUG = '';
const core = await import(pathToFileURL(bundle).href);
await rm(directory, { recursive: true });
const {
  renderToStreamCompiled: render,
  createQRL: qrl,
  createSsrPending: pending,
  createSsrCatch: caught,
  useSignal,
  useStyles,
  useComputedQrl,
  createComponent,
  renderSsrContent,
  Computed,
  disposeSubscriber,
  Task,
  TaskSubscription,
  runTaskSubscriber,
  Phase,
  SubscriberFlags,
} = core;
const graph = (rows) =>
  Array.from({ length: rows }, (_, i) => ({ id: i, label: `row-${i}`, child: { count: i } }));
const options = {
  qwikLoader: 'never',
  preloader: false,
  instanceHash: 'benchmark',
  outOfOrder: true,
  ...(scenario === 'discard' ? { symbolMapper: (symbol) => [symbol, 'bench.js'] } : {}),
  ...(scenario.startsWith('packets-metadata')
    ? { symbolMapper: (symbol) => [symbol, 'bench.js'] }
    : {}),
};
async function once() {
  let bytes = 0;
  const releases = [];
  let nextPacket = 0;
  let metadataPackets = 0;
  const metadataCount = scenario === 'packets-metadata-large' ? 500 : 100;
  let peakHeap = process.memoryUsage().heapUsed;
  const sample = () => {
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  };
  let interval = setInterval(sample, 1);
  const root = (_props, ctx) => {
    const observe = ctx.serializationCtx.$onAddRoot$;
    ctx.serializationCtx.$onAddRoot$ = (id, root, value, isNew) => {
      observe?.(id, root, value, isNew);
      if (id % 64 === 0) {
        sample();
      }
    };
    if (scenario === 'plain') {
      ctx.addRoot(graph(5000));
      return '<p>shell</p>';
    }
    if (scenario === 'content' || scenario.startsWith('content-')) {
      const body = qrl('bench.js', 'content-body', (state) => {
        if (scenario === 'content-retry' && state.attempts++ < 2) {
          throw Promise.resolve();
        }
        const output = scenario.endsWith('nested')
          ? ['<p>', Promise.resolve('content'), '</p>']
          : '<p>content</p>';
        return scenario.includes('async') ? Promise.resolve(output) : output;
      });
      return Array.from({ length: 5000 }, (_, index) => {
        if (index % 64 === 0) {
          sample();
        }
        return renderSsrContent(
          ctx,
          ctx.nextId(),
          scenario === 'content-retry' ? [{ attempts: 0 }] : [],
          body
        );
      });
    }
    if (scenario === 'tasks') {
      let runs = 0;
      for (let index = 0; index < 5000; index++) {
        if (index % 64 === 0) {
          sample();
        }
        const subscription = new TaskSubscription(
          new Task(() => {
            runs++;
          }, Phase.BlockingTask),
          ctx.scheduler
        );
        subscription.flags = SubscriberFlags.Dirty;
        runTaskSubscriber(subscription);
      }
      if (runs !== 5000) {
        throw new Error('Task benchmark did not execute every body');
      }
      return '<p>tasks</p>';
    }
    if (scenario === 'serialization-async') {
      ctx.addRoot(Array.from({ length: 500 }, (_, index) => Promise.resolve({ index })));
      return '<p>async serialization</p>';
    }
    if (scenario === 'computed-async-cleanups') {
      let cleaned = 0;
      const values = [];
      const cleanups = [];
      for (let index = 0; index < 5000; index++) {
        const value = new Computed(null, ({ cleanup: register }) => {
          register(() =>
            Promise.resolve().then(() => {
              cleaned++;
            })
          );
          return 42;
        });
        value.value;
        values.push(value);
        cleanups.push(value.runUserCleanups());
        if (index % 64 === 0) {
          sample();
        }
      }
      return Promise.all(cleanups).then(() => {
        for (let index = 0; index < values.length; index++) {
          disposeSubscriber(values[index]);
        }
        if (cleaned !== 5000) {
          throw new Error('Async cleanup benchmark skipped a callback');
        }
        return '<p>async computed cleanups</p>';
      });
    }
    if (scenario === 'computed-cleanups') {
      let cleaned = 0;
      const cleanup = () => {
        cleaned++;
      };
      for (let index = 0; index < 5000; index++) {
        if (index % 64 === 0) {
          sample();
        }
        const value = new Computed(null, ({ cleanup: register }) => {
          register(cleanup);
          return 42;
        });
        if (value.value !== 42) {
          throw new Error('Computed cleanup benchmark produced an invalid value');
        }
        disposeSubscriber(value);
      }
      if (cleaned !== 5000) {
        throw new Error('Computed cleanup benchmark skipped a callback');
      }
      return '<p>computed cleanups</p>';
    }
    if (scenario === 'computed') {
      let total = 0;
      for (let index = 0; index < 5000; index++) {
        if (index % 64 === 0) {
          sample();
        }
        total += new Computed(null, () => 42).value;
      }
      if (total !== 210000) {
        throw new Error('Computed benchmark produced an invalid total');
      }
      return `<p>${total}</p>`;
    }
    if (scenario === 'components-async' || scenario === 'components-retry') {
      return Array.from({ length: 5000 }, () => {
        let attempts = 0;
        return createComponent(() => {
          if (scenario === 'components-async') {
            return Promise.resolve('<p>component</p>');
          }
          if (attempts++ < 2) {
            throw Promise.resolve();
          }
          return '<p>component</p>';
        }, null);
      });
    }
    if (scenario === 'components') {
      return Array.from({ length: 5000 }, () => createComponent(() => '<p>component</p>', null));
    }
    if (scenario === 'fragments') {
      return caught(
        ctx,
        ctx.nextId(),
        qrl('bench.js', 'fragment-catch', (scope) =>
          pending(
            scope,
            scope.nextId(),
            qrl('bench.js', 'fragments', () =>
              Array.from({ length: 6000 }, () => ['<i>', 'fragment', '</i>'])
            )
          )
        ),
        qrl('bench.js', 'fallback', () => '<p>fallback</p>')
      );
    }
    if (scenario.startsWith('packets-metadata')) {
      return Promise.all(
        Array.from({ length: metadataCount }, (_, index) =>
          pending(
            ctx,
            ctx.nextId(),
            qrl('bench.js', 'metadata-body', () => {
              useStyles('.row-' + index + '{color:red}', 'row-' + index);
              const computed = useComputedQrl(
                qrl('bench.js', 'computed', () => index),
                { initial: -1, clientOnly: true }
              );
              computed.value;
              return new Promise((resolve) => {
                releases.push(() => resolve('<p>metadata-' + index + '</p>'));
              });
            }),
            qrl('bench.js', 'metadata-placeholder', () => '<p>waiting</p>')
          )
        )
      );
    }
    if (scenario === 'packets') {
      return Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          pending(
            ctx,
            ctx.nextId(),
            qrl('bench.js', 'content', (scope) => {
              scope.addRoot(graph(200));
              return new Promise((done) => setTimeout(() => done(`<p>${i}</p>`), i % 4));
            }),
            qrl('bench.js', 'placeholder', () => '<p>waiting</p>')
          )
        )
      );
    }
    return Promise.all(
      Array.from({ length: 12 }, () =>
        caught(
          ctx,
          ctx.nextId(),
          qrl('bench.js', 'broken', (scope) => {
            scope.addRoot(graph(1000));
            scope.addRoot(useSignal(new Error('PRIVATE')));
            throw new Error('failed');
          }),
          qrl('bench.js', 'fallback', () => '<p>fallback</p>')
        )
      )
    );
  };
  const start = performance.now();
  await render(root, {
    ...options,
    stream: {
      write(chunk) {
        bytes += chunk.length;
        if (scenario.startsWith('packets-metadata')) {
          if (chunk.includes('window._qwikS(document.currentScript,')) {
            if (
              !chunk.includes('q:idle=') ||
              !chunk.includes('_res') ||
              !chunk.includes('<style q:style=')
            ) {
              throw new Error('Metadata packet is missing styles or eager resume');
            }
            metadataPackets++;
            releases[nextPacket++]?.();
          } else if (chunk.includes('w._qwikS=')) {
            releases[nextPacket++]?.();
          }
        }
        sample();
      },
    },
  });
  if (scenario.startsWith('packets-metadata') && metadataPackets !== metadataCount) {
    throw new Error('Metadata benchmark did not publish every packet');
  }
  const milliseconds = performance.now() - start;
  sample();
  clearInterval(interval);
  return { milliseconds, bytes, peakHeap };
}
for (let i = 0; i < 8; i++) {
  await once();
}
global.gc();
let inspector;
const post = (method, params = {}) =>
  new Promise((resolve, reject) =>
    inspector.post(method, params, (error, result) => (error ? reject(error) : resolve(result)))
  );
if (profileMode === 'alloc') {
  inspector = new Session();
  inspector.connect();
  await post('HeapProfiler.startSampling', {
    samplingInterval: 16384,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
}
const samples = [];
for (let i = 0; i < (profileMode === 'alloc' ? 8 : 25); i++) {
  global.gc();
  samples.push(await once());
}
let allocatedBytes;
if (inspector) {
  const { profile } = await post('HeapProfiler.stopSampling');
  const total = (node) =>
    node.selfSize + node.children.reduce((sum, child) => sum + total(child), 0);
  allocatedBytes = total(profile.head) / samples.length;
  inspector.disconnect();
}
const sorted = samples.map((x) => x.milliseconds).sort((a, b) => a - b);
console.log(
  JSON.stringify({
    source,
    scenario,
    mode: profileMode,
    medianMilliseconds: sorted[Math.floor(sorted.length / 2)],
    peakHeapBytes: Math.max(...samples.map((x) => x.peakHeap)),
    maxRssKB: process.resourceUsage().maxRSS,
    responseBytes: samples[0].bytes,
    allocatedBytes,
  })
);

// Qwik scheduler MessagePorts otherwise keep the benchmark process alive.
process.exit(0);
