/**
 * One glossary entry. In `glossary` the record key is the canonical id (kebab-case) and the
 * `/docs/glossary#<id>` anchor. `<Term id>` accepts the canonical id or any alias.
 */
export interface GlossaryEntry {
  /** Display name shown as the heading on the `/docs/glossary` page. */
  display: string;
  /** Alternate ids that resolve to this same definition (also usable as `<Term id>`). */
  aliases?: readonly string[];
  /** The definition shown in the toggletip. Keep to ~240 plain characters. */
  short: string;
}
