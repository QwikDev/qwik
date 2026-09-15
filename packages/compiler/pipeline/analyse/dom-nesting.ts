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
  select: ['option', 'optgroup', 'hr', 'script', 'template'],
  optgroup: ['option', 'script', 'template'],
};

/** Elements the parser refuses to nest inside themselves. */
const NOT_INSIDE_ITSELF = new Set(['a', 'button', 'form', 'li', 'dd', 'dt', 'nobr', 'select']);

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
  if (NOT_INSIDE_ITSELF.has(tag) && ancestors.includes(tag)) {
    throw fail(`cannot be nested inside another <${tag}>`);
  }
}
