/** Emission vocabulary (the pipeline's `src/words.ts` peer) — grows as ops land. */

export const QWIK_CORE_IMPORT = '@qwik.dev/core';

/** Runtime names imported from `@qwik.dev/core`. */
export const enum QwikWord {
  // csr
  CreateTemplate = 'createTemplate',
  FirstChild = '_first',
  LastChild = '_last',
  NextSibling = '_next',
  PreviousSibling = '_prev',
  SetEvent = 'setEvent',
  CreateTextExpressionEffect = 'createTextExpressionEffect',
  CreateTextNodeEffect = 'createTextNodeEffect',
  // ssr
  CreateSsrOpenTag = 'createSsrOpenTag',
  CreateSsrMarkup = 'createSsrMarkup',
  CreateSsrNodeId = 'createSsrNodeId',
  CreateSsrElementTextTarget = 'createSsrElementTextTarget',
  CreateSsrRangeTextTarget = 'createSsrRangeTextTarget',
  EscapeHTML = 'escapeHTML',
  RenderSsrTextExpression = 'renderSsrTextExpression',
  RenderSsrTextNode = 'renderSsrTextNode',
  MaybeThen = 'maybeThen',
  // shared
  NoopQrl = '_noopQrl',
  UseSignal = 'useSignal',
  Captures = '_captures',
}

/** Name stems for generated locals. */
export const enum QwikGenWord {
  Template = 'tmpl',
  Fragment = 'fragment',
  Element = 'el',
  Text = 'text',
  Effect = 'effect',
  Id = 'id',
  Marker = 'marker',
  ComponentProps = 'props',
  ComponentContext = 'ctx',
}

/** Authored hook names recognized in component setup. */
export const enum QwikHook {
  UseSignal = 'useSignal',
}
