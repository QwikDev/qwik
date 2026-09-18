/** HTML facts shared across analyse and the generators. */

/** Elements that never take children and close without an end tag. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Elements whose content the parser never decodes: a literal, guarded against a premature closer. */
export const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style']);

/** Elements whose first newline the parser drops right after the open tag. */
export const NEWLINE_EATING_ELEMENTS: ReadonlySet<string> = new Set(['pre', 'textarea']);

/** Elements whose content is one text node: the parser reads a comment marker there as text. */
export const RCDATA_ELEMENTS: ReadonlySet<string> = new Set(['title', 'textarea']);

/** Element names only SVG defines; a shared name (`a`, `title`, `script`, `style`) stays HTML. */
const SVG_ONLY_ELEMENTS: ReadonlySet<string> = new Set([
  'animate',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'foreignObject',
  'g',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'metadata',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'set',
  'stop',
  'switch',
  'symbol',
  'text',
  'textPath',
  'tspan',
  'use',
  'view',
]);

/** Element names only MathML defines. */
const MATHML_ONLY_ELEMENTS: ReadonlySet<string> = new Set([
  'annotation',
  'annotation-xml',
  'maction',
  'menclose',
  'merror',
  'mfenced',
  'mfrac',
  'mi',
  'mmultiscripts',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mprescripts',
  'mroot',
  'mrow',
  'ms',
  'mspace',
  'msqrt',
  'mstyle',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'semantics',
]);

/** The namespace a tag authored outside any namespace element must belong to, if only one. */
export function inferredNamespace(tag: string): 'svg' | 'math' | null {
  return SVG_ONLY_ELEMENTS.has(tag) ? 'svg' : MATHML_ONLY_ELEMENTS.has(tag) ? 'math' : null;
}

export function normalizeAttributeName(name: string): string {
  return name === 'className' ? 'class' : name === 'htmlFor' ? 'for' : name;
}

export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

/**
 * `null` = omit the attribute; `''` = bare attribute; otherwise the (unescaped) value text.
 * `aria-*`/`spellcheck`/`draggable`/`contenteditable` stringify booleans — even `false`.
 */
export function serializeAttrValue(
  name: string,
  value: string | number | boolean | null
): string | null {
  const normalized = name.toLowerCase();
  if (
    normalized.startsWith('aria-') ||
    normalized === 'spellcheck' ||
    normalized === 'draggable' ||
    normalized === 'contenteditable'
  ) {
    return value === null ? null : String(value);
  }
  if (value === false || value === null) {
    return null;
  }
  if (value === true) {
    return '';
  }
  return String(value);
}
