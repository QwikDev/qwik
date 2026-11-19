import type { Range } from '../schema';
import { InvalidModuleError } from '../errors';

/** Content that closes an open `<p>`: the parser would split the paragraph around it. */
const CLOSES_PARAGRAPH = new Set(
  'address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer header hgroup main menu nav ol p section summary ul pre listing table hr xmp h1 h2 h3 h4 h5 h6'.split(
    ' '
  )
);

/** Elements the parser only accepts under specific parents; elsewhere it moves or drops them. */
const REQUIRED_PARENT: Record<string, readonly string[]> = {
  tr: ['tbody', 'thead', 'tfoot'],
  td: ['tr'],
  th: ['tr'],
  tbody: ['table'],
  thead: ['table'],
  tfoot: ['table'],
  caption: ['table'],
  colgroup: ['table'],
  col: ['colgroup'],
  option: ['select', 'datalist', 'optgroup'],
  optgroup: ['select'],
  li: ['ul', 'ol', 'menu'],
  dt: ['dl', 'div'],
  dd: ['dl', 'div'],
};

/** Parents whose other children the parser drops outright. */
const ALLOWED_CHILDREN: Record<string, readonly string[]> = {
  head: ['title', 'meta', 'link', 'style', 'script', 'noscript', 'base', 'template'],
  select: ['option', 'optgroup', 'hr', 'script', 'template'],
  optgroup: ['option', 'script', 'template'],
};

const words = (list: string) => new Set(list.split(' '));

/** The parser's default scope: its search for an open element stops at these. */
const DEFAULT_SCOPE = words(
  'applet caption html table td th marquee object template mi mo mn ms mtext annotation-xml foreignObject desc title'
);

/** The special elements except address, div and p: an open li, dd or dt is not searched past them. */
const LIST_ITEM_SCOPE = words(
  'applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd details dir dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input keygen li link listing main marquee menu meta nav noembed noframes noscript object ol param plaintext pre script search section select source style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp mi mo mn ms mtext annotation-xml foreignObject desc'
);

interface SelfNesting {
  /** Open elements the start tag closes or is ignored against. */
  conflicts: readonly string[];
  /** Ancestors that end the parser's search for a conflicting open element. */
  scope: ReadonlySet<string>;
}

/** Elements the parser refuses to nest inside an open one of their kind, within its search scope. */
const NOT_INSIDE_ITSELF: Record<string, SelfNesting> = {
  a: { conflicts: ['a'], scope: words('applet marquee object template td th caption') },
  button: { conflicts: ['button'], scope: DEFAULT_SCOPE },
  nobr: { conflicts: ['nobr'], scope: DEFAULT_SCOPE },
  select: { conflicts: ['select'], scope: DEFAULT_SCOPE },
  form: { conflicts: ['form'], scope: words('template') },
  li: { conflicts: ['li'], scope: LIST_ITEM_SCOPE },
  dd: { conflicts: ['dd', 'dt'], scope: LIST_ITEM_SCOPE },
  dt: { conflicts: ['dd', 'dt'], scope: LIST_ITEM_SCOPE },
};

function findConflictingAncestor(tag: string, ancestors: readonly string[]): string | null {
  const rule = NOT_INSIDE_ITSELF[tag];
  if (rule === undefined) {
    return null;
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (rule.conflicts.includes(ancestors[i])) {
      return ancestors[i];
    }
    if (rule.scope.has(ancestors[i])) {
      return null;
    }
  }
  return null;
}

/**
 * Invalid nesting is not representable: the parser restructures it identically on the server and in
 * the client template, and every range marker at that boundary lands in the wrong place.
 */
export function checkDomNesting(tag: string, ancestors: readonly string[], range: Range): void {
  const parent = ancestors.at(-1);
  const fail = (reason: string) =>
    new InvalidModuleError(
      'dom-nesting',
      `<${tag}> ${reason}: the HTML parser would restructure it.`,
      range
    );
  const isWrongParent =
    parent !== undefined &&
    (REQUIRED_PARENT[tag]?.includes(parent) === false ||
      ALLOWED_CHILDREN[parent]?.includes(tag) === false);
  if (isWrongParent) {
    throw fail(`cannot be a child of <${parent}>`);
  }
  if (CLOSES_PARAGRAPH.has(tag) && ancestors.includes('p')) {
    throw fail('cannot appear inside <p>');
  }
  const conflict = findConflictingAncestor(tag, ancestors);
  if (conflict !== null) {
    throw fail(`cannot be nested inside ${conflict === tag ? 'another ' : ''}<${conflict}>`);
  }
}
