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
