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
