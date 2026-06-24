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
  'content-projection': {
    display: 'Content projection',
    aliases: ['slot', 'slots', 'transclusion'],
    short:
      'The mechanism by which a component receives JSX content from its parent and projects it into designated Slot locations in its template, keeping parent and child rendering independent.',
  },
  jsx: {
    display: 'JSX',
    aliases: ['jsx syntax'],
    short:
      'A syntax for expressing component templates in Qwik by writing HTML-like markup directly in JavaScript, which the compiler transforms into function calls. JSX is just syntax — not a virtual DOM.',
  },
  'immutable-props': {
    display: 'Immutable props',
    aliases: ['prop immutability', 'shallow immutability'],
    short:
      'The constraint that props in Qwik components are shallowly immutable: primitive values cannot be reassigned once passed, though properties of objects and arrays can be modified.',
  },
  'prop-drilling': {
    display: 'Prop drilling',
    aliases: ['drilling', 'prop threading'],
    short:
      "The pattern of passing data through a chain of intermediate components that don't use it themselves, only to reach a descendant that does. Context APIs solve this problem in Qwik.",
  },
  'class-binding': {
    display: 'Class binding',
    aliases: ['classlist', 'class object', 'conditional classes', 'class dictionary'],
    short:
      'The ability to pass the class attribute an object mapping CSS class names to boolean conditions, so classes are applied only when their conditions are true.',
  },
  'dangerously-set-inner-html': {
    display: 'dangerouslySetInnerHTML',
    aliases: ['setinnerhtml', 'inner html'],
    short:
      'A Qwik prop for inserting raw HTML into the DOM (replacing innerHTML). Its deliberately alarming name warns that injecting untrusted HTML exposes the app to cross-site scripting (XSS).',
  },
  invalidate: {
    display: 'Invalidate',
    aliases: ['invalidation', 'invalidated', 'marking dirty'],
    short:
      'Marking a component or task to re-run or re-render because its tracked state changed. Qwik queues invalidated work and flushes it as a batch rather than synchronously.',
  },
  proxy: {
    display: 'Proxy',
    aliases: ['store proxy', 'reactive proxy'],
    short:
      'A JavaScript Proxy object created by useStore() that wraps application state and automatically tracks which components and tasks read each property, creating fine-grained subscriptions.',
  },
  track: {
    display: 'Track',
    aliases: ['tracking', 'tracked'],
    short:
      'A function passed to useTask$() and useVisibleTask$() that marks which signals, stores, or computed values should be watched. When tracked state changes, the task re-executes.',
  },
  subscription: {
    display: 'Subscription',
    aliases: ['subscriptions', 'subscribe'],
    short:
      'An automatic relationship registered when a component or task reads a signal or store property, causing that component or task to re-execute or re-render when the property changes.',
  },
  scheduler: {
    display: 'Scheduler',
    aliases: ['scheduling', 'render scheduler', 'task scheduler'],
    short:
      "Qwik's internal system that queues and orders the execution of tasks, component renders, and DOM updates, batching related work for efficiency.",
  },
  'paused-state': {
    display: 'Paused state',
    aliases: ['paused', 'q:container paused'],
    short:
      'The initial state of a Qwik container after server-side rendering, serialized with application state and event listeners ready to resume on the client. Marked by q:container="paused" in HTML.',
  },
  'resumed-state': {
    display: 'Resumed state',
    aliases: ['resumed', 'q:container resumed'],
    short:
      'The active state of a Qwik container after the client deserializes the server-serialized state and listeners from the HTML and begins executing event handlers and tasks.',
  },
  qwikloader: {
    display: 'Qwikloader',
    short:
      'A tiny (~1 kb) inlined JavaScript runtime that sets up global event listeners and lazy-loads event handlers on demand by searching the DOM for QRL attributes and fetching the corresponding code chunks.',
  },
  'out-of-order-streaming-segment': {
    display: 'Out-of-order streaming segment',
    aliases: ['segment', 'streaming segment'],
    short:
      'A chunk of HTML sent independently during out-of-order streaming when a Suspense boundary resolves asynchronously, allowing faster sections to reach the browser immediately without waiting for slower async content.',
  },
  'serialization-boundary': {
    display: 'Serialization boundary',
    aliases: ['dollar boundary', '$ boundary'],
    short:
      'A lexical scope boundary marked by a $ function wrapper where only serializable data can cross; trying to capture non-serializable values (like custom class instances) will cause a runtime error.',
  },
  'qwik-json-script': {
    display: 'qwik/json script',
    aliases: ['qwik/json', 'serialized state script'],
    short:
      "A script tag with type='qwik/json' that embeds the serialized application state, listeners, and component tree information into the HTML so the client can resume without re-running components.",
  },
  dag: {
    display: 'DAG',
    aliases: ['directed acyclic graph'],
    short:
      'Directed acyclic graph: a tree structure with no circular references. JSON only serializes DAGs; Qwik overcomes this limitation by properly handling circular object references in application state.',
  },
  'island-architecture': {
    display: 'Island architecture',
    aliases: ['islands', 'partial hydration'],
    short:
      'A technique where developers manually mark isolated interactive regions of an otherwise static page and choose when each island activates. Qwik avoids islands, resuming the whole app from serialized state.',
  },
  chunk: {
    display: 'Chunk',
    aliases: ['lazy-loadable code unit', 'code chunk'],
    short:
      'A JavaScript file containing one or more lazy-loadable symbols. Qwik bundles related symbols together into chunks to balance download size and request overhead.',
  },
  bundle: {
    display: 'Bundle',
    aliases: ['bundled file', 'bundled code'],
    short:
      "A compiled JavaScript file containing one or more symbols packaged together for delivery. Bundles are generated by Qwik's optimizer and downloaded by the browser on demand.",
  },
  'entry-point': {
    display: 'Entry point',
    aliases: ['bundler entry', 'entry'],
    short:
      'A file or location where the bundler begins processing code — typically the root component or library export. In Qwik, can refer to client entry, SSR entry, or bundler configuration entry.',
  },
  'qwik-vite-plugin': {
    display: 'Qwik Vite plugin',
    aliases: ['qwikVite', 'qwik-vite', 'qwik vite plugin'],
    short:
      'The Vite integration plugin (qwikVite()) that enables Qwik to automatically split components into lazy-loadable chunks and configure bundle optimization strategies.',
  },
  'tree-shaking': {
    display: 'Tree-shaking',
    aliases: ['tree shake', 'dead code elimination'],
    short:
      "A bundler optimization that removes unreferenced code from the final bundle. Qwik's optimizer enables tree-shaking by breaking direct references between components into QRLs.",
  },
  'library-mode': {
    display: 'Library mode',
    aliases: ['library', 'lib mode'],
    short:
      "Vite's build mode for creating reusable component libraries. Qwik libraries use it to export components as .qwik.mjs files that integrate with the Qwik optimizer.",
  },
  colocation: {
    display: 'Colocation',
    aliases: ['colocate', 'colocated', 'co-locate', 'co-located'],
    short:
      "Placing related symbols together in the same bundle so they load together. Qwik's bundler groups symbols used together in the same chunk to minimize the number of download requests.",
  },
  'service-worker': {
    display: 'Service Worker',
    aliases: ['service workers', 'sw'],
    short:
      'A background JavaScript process that Qwik uses to prefetch bundles into the browser cache before user interactions, reducing latency when event handlers are needed.',
  },
  waterfall: {
    display: 'Network Waterfall',
    aliases: ['request waterfall', 'waterfalls'],
    short:
      "Sequential, dependent requests where modules cannot start downloading until previous modules finish. Qwik reduces waterfalls via speculative prefetching and the manifest's import graph.",
  },
  eagerness: {
    display: 'Eagerness',
    aliases: ['eager loading', 'eager execution'],
    short:
      'The timing strategy for when a qwikified React island or component should be downloaded and made interactive, such as on load, idle, visible, hover, or via a signal.',
  },
  'client-directives': {
    display: 'client: directives',
    aliases: ['client:load', 'client:idle', 'client:visible', 'client:hover', 'client:only'],
    short:
      'JSX attributes that control when a qwikified React component is downloaded and made interactive in the browser: client:load, client:idle, client:visible, client:hover, client:signal, client:event, or client:only.',
  },
  partytown: {
    display: 'Partytown',
    aliases: ['partytown tool'],
    short:
      'A tool that moves third-party scripts like Google Analytics onto a web worker, preventing them from blocking the main thread during initial page load.',
  },
  mpa: {
    display: 'MPA',
    aliases: ['multi-page application'],
    short:
      'Multi-page application: a traditional web app where each page navigation loads a fresh HTML page from the server. Qwik supports MPA navigation alongside SPA for maximum flexibility.',
  },
  spa: {
    display: 'SPA',
    aliases: ['single-page application'],
    short:
      'Single-page application: a web app that navigates without full page reloads by updating the DOM on the client. Qwik lets you choose SPA navigation per-link and maintains best-in-class scroll restoration.',
  },
  'spa-navigation': {
    display: 'SPA navigation',
    aliases: ['spa navigate'],
    short:
      'Client-side page transition using the Link component or useNavigate() hook instead of a full page reload. In Qwik apps, users are automatically upgraded to SPA mode when using these methods.',
  },
  'dynamic-route': {
    display: 'Dynamic route',
    aliases: ['dynamic route segment', 'route parameter'],
    short:
      'A route with variable URL segments marked with square brackets, like [id] or [...slug], that match multiple URLs and extract values into params. Use dynamic routes for flexible patterns like /products/123.',
  },
  'static-route': {
    display: 'Static route',
    aliases: ['static route segment'],
    short:
      'A route with a fixed URL path defined by directory names, like /docs/getting-started. Each static route matches only its exact pathname, unlike dynamic routes with variable segments.',
  },
  'scroll-restoration': {
    display: 'Scroll restoration',
    aliases: ['scroll restore', 'scroll position'],
    short:
      'Automatically returning the user to their previous scroll position when navigating back in history. Qwik provides best-in-class scroll restoration for SPA navigation based on browser history.',
  },
  'shared-map': {
    display: 'sharedMap',
    aliases: ['sharedmap', 'shared map'],
    short:
      'A scoped Map available in request handlers that persists data across middleware functions and loaders for a single HTTP request. Useful for sharing authentication state or logging context between handlers.',
  },
  'cache-control': {
    display: 'cacheControl',
    aliases: ['cacheControl', 'cache control'],
    short:
      'A convenience function in request handlers to set HTTP Cache-Control headers (maxAge, sMaxAge, staleWhileRevalidate, public/private). Controls how browsers and CDNs cache page responses.',
  },
  'stale-while-revalidate': {
    display: 'Stale-while-revalidate',
    aliases: ['stale while revalidate', 'swr'],
    short:
      'A cache strategy that serves stale cached content to users immediately while revalidating it in the background. Enables instant page loads while keeping content fresh without the user waiting for revalidation.',
  },
  xss: {
    display: 'XSS',
    aliases: ['cross-site scripting'],
    short:
      "Cross-site scripting: an attack where malicious code is injected into a webpage and runs in other users' browsers. CSP and output escaping help prevent XSS attacks.",
  },
  csrf: {
    display: 'CSRF',
    aliases: ['cross-site request forgery'],
    short:
      "Cross-site request forgery: an attack that tricks a user into making an unintended request to a website where they're authenticated, often using hidden forms or image tags.",
  },
  csp: {
    display: 'CSP',
    aliases: ['content security policy'],
    short:
      'Content Security Policy: an HTTP header that tells the browser which sources of scripts, styles, images, and other resources are trusted, helping prevent XSS and data injection attacks.',
  },
  nonce: {
    display: 'Nonce',
    short:
      'A random, unique token generated per request and added to CSP directives and inline scripts to allow only those specific scripts to run, blocking unauthorized inline code.',
  },
  'view-transition-api': {
    display: 'View Transition API',
    aliases: ['view transitions'],
    short:
      'A browser API that animates smooth visual transitions between page states, creating a native view-to-view animation without full page reloads.',
  },
  formdata: {
    display: 'FormData',
    aliases: ['form data'],
    short:
      'A built-in JavaScript interface for serializing form fields into key-value pairs, commonly used for multipart file uploads and programmatic form submission.',
  },
  popover: {
    display: 'Popover',
    aliases: ['popover api', 'html popover'],
    short:
      'An HTML API that opens a floating box anchored to a trigger element in the top layer, supporting modal and non-modal popovers with automatic positioning and click-outside dismiss.',
  },
  'top-layer': {
    display: 'Top layer',
    aliases: ['top layer', '::backdrop'],
    short:
      'A special stacking context above all other page content where popovers, modals, and dialogs render to ensure they stay visible and receive focus without z-index conflicts.',
  },
  'prefers-color-scheme': {
    display: 'prefers-color-scheme',
    aliases: ['color scheme', 'dark mode', 'light mode'],
    short:
      'A CSS media query that detects whether the user prefers a dark or light color scheme at the OS level, enabling sites to match system appearance preferences.',
  },
  abortsignal: {
    display: 'AbortSignal',
    aliases: ['abort signal'],
    short:
      'A browser API that allows canceling asynchronous operations like fetch requests or timers, commonly used with AbortController to clean up in-flight requests on navigation or component unmount.',
  },
  adapter: {
    display: 'Adapter',
    aliases: ['deployment adapter', 'qwik adapter'],
    short:
      'A Vite configuration plugin tailored to a specific hosting platform (Cloudflare, Netlify, Vercel, AWS Lambda, etc.) that handles build output format and server integration.',
  },
  'edge-functions': {
    display: 'Edge functions',
    aliases: ['edge function'],
    short:
      "Code that runs on a CDN's edge servers geographically close to visitors, enabling fast server-side logic execution without traditional server latency.",
  },
  'serverless-functions': {
    display: 'Serverless functions',
    aliases: ['serverless function', 'serverless', 'functions as a service', 'faas'],
    short:
      'Stateless, on-demand code execution (e.g. AWS Lambda) that scales automatically, where you pay only for the time code runs without managing servers.',
  },
  'edge-runtime': {
    display: 'Edge runtime',
    aliases: ['edge environment'],
    short:
      'A lightweight JavaScript execution environment (e.g. V8-based) running on edge servers that supports a subset of web APIs and prioritizes fast cold starts.',
  },
  'cold-start': {
    display: 'Cold start',
    aliases: ['cold boot'],
    short:
      'The latency experienced when a serverless or edge function instance initializes for the first time, before executing user code.',
  },
  'micro-frontend': {
    display: 'Micro-frontend',
    aliases: ['microfrontend', 'micro frontend'],
    short:
      'An architecture pattern where multiple independent front-end applications run together in a single page, each managing its own functionality and lifecycle.',
  },
  'origin-env': {
    display: 'ORIGIN',
    short:
      "An environment variable set to the site's origin (e.g. https://example.com/) for resolving relative URLs and validating request origins during CSRF protection.",
  },
  'platform-bindings': {
    display: 'Platform bindings',
    aliases: ['platform binding', 'bindings'],
    short:
      'Named connections to cloud resources (KV stores, databases, buckets) configured on the hosting platform and accessed through the platform object in route handlers.',
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
