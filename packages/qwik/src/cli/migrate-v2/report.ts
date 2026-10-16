import { readFileSync } from 'fs';
import { isBinaryPath } from './tools/binary-extensions';
import { visitNotIgnoredFiles } from './tools/visit-not-ignored-files';

const warnings: string[] = [];

/** Records something the migration could not do automatically, printed at the end. */
export function warn(file: string, message: string) {
  warnings.push(`${file}: ${message}`);
}

/** Returns the recorded warnings and clears them. */
export function takeWarnings() {
  return warnings.splice(0);
}

/** Warns for every non-binary file containing `text`. */
export function warnMentions(text: string, message: string) {
  visitNotIgnoredFiles('.', (path) => {
    if (!isBinaryPath(path) && readFileSync(path, 'utf-8').includes(text)) {
      warn(path, message);
    }
  });
}

/** V2 behavior changes that the migration can't undo, printed after every migration. */
export const V2_BEHAVIOR_CHANGES = [
  'SPA navigation fetches every route loader with its own request (the middleware runs for each) and renders the new page before they resolve, so loader redirects and errors happen after the page is shown.',
  "Route loader data is not serialized into the HTML (`defaultLoadersSerializationStrategy: 'never'`), the browser fetches it when a loader is read after resuming.",
  'After an action, the route loaders are re-fetched with separate requests and loaders can no longer read the action result with `resolveValue(action)`.',
  'Unknown routes render the nearest `404.tsx` inside its layouts, route files named with other status codes (e.g. `500.tsx`) are ignored.',
  'SPA navigation pushes the history entry on click, scroll positions of history entries created before the upgrade are not restored.',
  'Tasks run right before their component re-renders, `useComputed$` computes lazily and stores thrown errors in `.error`, `useResource$` merges the results into the same store.',
  'Rendering: the client only sets `value` and boolean props as DOM properties, `contenteditable={false}` renders "false", `useId()` returns a different format and scoped styles use the `⚡️` class prefix instead of `⭐️`.',
  'Event handlers on the bubbling path run synchronously, so a parent `sync$` handler can call `preventDefault()`.',
  'Build output: chunks and hashes differ (Rolldown), route data is fetched from `q-loader-*.json` instead of `q-data.json` and actions POST to `?qaction=`. Update CDN and cache rules.',
  'The v2 qwikloader does not handle v1 containers on the same page.',
  'Third-party libraries that depend on "@builder.io/qwik" are aliased to v2 by the Vite plugin, but still install v1 for TypeScript and tests. Add package manager overrides if needed.',
];

/** Steps to move from the v1 compatible settings the migration added to the v2 defaults. */
const NEXT_STEPS: [marker: string | RegExp, step: string][] = [
  [
    'strictLoaders: false',
    'Remove `strictLoaders: false` from `qwikRouter()` and set `search` on the loaders and `invalidate` on the actions that need them.',
  ],
  [
    'view-transition-name:none',
    "Remove `viewTransition={true}` and `useStyles$(`:root{view-transition-name:none}`)` from the root if you don't want view transitions.",
  ],
  [
    'maximumInitialChunk: 50000',
    'Remove the `streaming.inOrder` option from `src/entry.ssr.tsx` to use the v2 chunk sizes.',
  ],
  [
    'requestBodyLimit: Number.MAX_SAFE_INTEGER',
    'Remove `requestBodyLimit: Number.MAX_SAFE_INTEGER` to limit request bodies to 10 MiB, or set your own limit.',
  ],
  [
    'useV1NavigationProbe',
    "Remove the `useV1NavigationProbe` loaders once your middleware doesn't need to run on SPA navigation (e.g. auth checks moved to route loaders).",
  ],
  [
    "internalRequest !== 'loader'",
    "Remove the `internalRequest !== 'loader'` checks and use the `cacheControl` option of `routeLoader$` to cache loader data.",
  ],
  [
    'prefetchData="visible"',
    'Remove `prefetchData="visible"` from `<Link>` to prefetch data on intent only.',
  ],
  [
    'plugin@000-v1-errors',
    'Delete `src/routes/plugin@000-v1-errors.ts` and add `error.tsx` files to render errors inside your layouts.',
  ],
  [
    /\brenderToStream\(/,
    'Use `createRenderer()` from "@qwik.dev/router" in `src/entry.ssr.tsx` like the v2 starters.',
  ],
  [
    /<QwikRouterProvider\b/,
    "Replace `<QwikRouterProvider>` with `useQwikRouter()` in the root component if it doesn't read signals.",
  ],
  [/(^|\/)src\/entry\.dev\.tsx\n/, 'Delete `src/entry.dev.tsx`, v2 no longer uses it.'],
  [
    /\bRouterHead\b/,
    'Render `<DocumentHeadTags />` from "@qwik.dev/router" instead of a custom `RouterHead` component.',
  ],
];

/** Next steps for the files of the project, followed by the steps for every project. */
export function nextSteps() {
  const found = new Set<string>();
  visitNotIgnoredFiles('.', (path) => {
    if (isBinaryPath(path) || /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)) {
      return;
    }
    // markers match the path or the content
    const text = `${path}\n${readFileSync(path, 'utf-8')}`;
    for (const [marker, step] of NEXT_STEPS) {
      if (typeof marker === 'string' ? text.includes(marker) : marker.test(text)) {
        found.add(step);
      }
    }
  });
  return [
    ...NEXT_STEPS.map(([, step]) => step).filter((step) => found.has(step)),
    'Run your type check, linter (eslint-plugin-qwik has new rules) and tests, then review the migrated code.',
  ];
}
