import type { GlossaryEntry } from './glossary.types';

/**
 * Single source of truth for glossary terms. Consumed by `<Term>`, the `/docs/glossary` page, and
 * the llms mirrors. The record key is the canonical id and the `/docs/glossary#<id>` anchor; `<Term
 * id>` also accepts any alias and resolves it to the same definition.
 */
export const glossary = {
  resumability: {
    display: 'Resumability',
    aliases: ['resumable', 'resume'],
    short:
      'Qwik serializes application state and event listeners into the HTML during SSR, so the client continues exactly where the server stopped without re-running component code.',
  },
  qrl: {
    display: 'QRL',
    aliases: ['qrls'],
    short:
      'A Qwik URL: a serializable, lazy reference to code — most commonly a `$`-wrapped function — that the browser preloads and runs only when it is actually needed.',
  },
  vnode: {
    display: 'VNode',
    aliases: ['vnodes', 'virtual node'],
    short:
      "Qwik's virtual node: a lightweight description of a rendered DOM node that the runtime uses to update output without re-running whole components.",
  },
  hydration: {
    display: 'Hydration',
    short:
      'The step other frameworks run on the client to make server-rendered HTML interactive: they re-execute components and reattach listeners. Qwik avoids this by resuming from serialized state.',
  },
  'hydration-mismatch': {
    display: 'Hydration mismatch',
    aliases: ['hydration mismatches'],
    short:
      'An error in hydration-based frameworks when the client render produces different markup than the server sent, breaking listeners or layout. Qwik avoids it by resuming the existing DOM.',
  },
  serialization: {
    display: 'Serialization',
    aliases: ['serialize', 'serialized', 'deserialize', 'deserialization'],
    short:
      'Converting application state, event listeners, and framework data structures into text embedded in the HTML, so the browser can resume from it instead of rebuilding everything in memory.',
  },
  'lazy-loading': {
    display: 'Lazy loading',
    aliases: ['lazy load', 'lazy-load', 'lazy loaded', 'lazy execution', 'lazily'],
    short:
      'Downloading and running code only at the moment it is actually needed instead of up front. Qwik splits an app into many lazy-loadable chunks and the runtime fetches each one on demand.',
  },
  ssr: {
    display: 'SSR',
    aliases: ['server-side rendering', 'server side rendering', 'server-rendered', 'server render'],
    short:
      "Server-side rendering: generating a page's HTML on the server so the user sees content immediately. Qwik serializes the app state into that HTML so the client can resume without re-rendering.",
  },
  csr: {
    display: 'CSR',
    aliases: ['client-side rendering', 'client side rendering', 'client-rendered', 'client render'],
    short:
      'Client-side rendering: building the page in the browser with JavaScript after load, so users wait on a blank shell until the bundle downloads and runs. The opposite trade-off from SSR.',
  },
  signal: {
    display: 'Signal',
    aliases: ['signals'],
    short:
      "Qwik's reactive state primitive, created with useSignal(). Reading a signal subscribes the surrounding code, so when its value changes only the exact DOM or task that depends on it updates.",
  },
  preloading: {
    display: 'Preloading',
    aliases: ['preload', 'prefetch', 'modulepreload', 'speculative module fetching'],
    short:
      'Fetching the JavaScript a user is likely to need next into the browser cache ahead of time, so it is already there when they interact. Qwik preloads bundles based on likely next interactions.',
  },
  ssg: {
    display: 'SSG',
    aliases: [
      'static site generation',
      'statically generated',
      'prerender',
      'prerendering',
      'prerendered',
    ],
    short:
      'Static site generation: rendering pages to static HTML at build time rather than per request, so they can be served straight from a CDN with no running server. Qwik Router can prerender routes.',
  },
  optimizer: {
    display: 'Optimizer',
    aliases: ['qwik optimizer'],
    short:
      "Qwik's build-time compiler (written in Rust) that splits components at every $ boundary into separate lazy-loadable chunks and generates the QRLs that reference them.",
  },
  streaming: {
    display: 'Streaming',
    aliases: ['out-of-order streaming', 'stream', 'streamed'],
    short:
      "Sending the HTML response to the browser in chunks as it is produced instead of waiting for the whole page. Qwik supports out-of-order streaming so slower sections don't block the rest.",
  },
  container: {
    display: 'Container',
    aliases: ['containers'],
    short:
      'A self-contained, independently resumable region of a Qwik app in the DOM. A single page can host several containers, each serialized and resumed on its own.',
  },
  reactivity: {
    display: 'Reactivity',
    aliases: ['reactive', 'fine-grained reactivity'],
    short:
      'How Qwik tracks which signals and stores each piece of UI reads, so a state change updates only the exact DOM nodes or tasks that depend on it — with no whole-component re-render.',
  },
} as const satisfies Record<string, GlossaryEntry>;

type GlossaryEntries = typeof glossary;
type CanonicalId = keyof GlossaryEntries;

/** A canonical id or any alias — all accepted by `<Term id>`. */
export type GlossaryId =
  | CanonicalId
  | {
      [K in CanonicalId]: GlossaryEntries[K] extends { readonly aliases: readonly string[] }
        ? GlossaryEntries[K]['aliases'][number]
        : never;
    }[CanonicalId];

/** All entries as `[canonicalId, entry]` for the `/docs/glossary` page. */
export const glossaryEntries = Object.entries(glossary) as Array<[CanonicalId, GlossaryEntry]>;

/** Resolve a canonical id or alias to its canonical id (the `/docs/glossary#<id>` anchor). */
export function resolveGlossaryId(id: GlossaryId): CanonicalId {
  if (id in glossary) {
    return id as CanonicalId;
  }
  const match = glossaryEntries.find(([, entry]) => entry.aliases?.includes(id));
  if (!match) {
    throw new Error(`Unknown glossary term: ${id}`);
  }
  return match[0];
}
