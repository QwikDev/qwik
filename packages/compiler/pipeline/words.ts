/** Emission vocabulary (the pipeline's `src/words.ts` peer) — grows as ops land. */

export const QWIK_CORE_IMPORT = '@qwik.dev/core';

/** Runtime names imported from `@qwik.dev/core`. */
export const enum QwikWord {
  // csr
  CreateTemplate = 'createTemplate',
  FirstChild = '_first',
  SetEvent = 'setEvent',
  CreateTextExpressionEffect = 'createTextExpressionEffect',
  // ssr
  CreateSsrElementRecord = 'createSsrElementRecord',
  CreateSsrNodeId = 'createSsrNodeId',
  CreateSsrElementTextTarget = 'createSsrElementTextTarget',
  EscapeHTML = 'escapeHTML',
  RenderSsrTextExpression = 'renderSsrTextExpression',
  MaybeThen = 'maybeThen',
  // shared
  NoopQrl = '_noopQrl',
}

/** Name stems for generated locals. */
export const enum QwikGenWord {
  Template = 'tmpl',
  Fragment = 'fragment',
  Element = 'el',
  Text = 'text',
  Effect = 'effect',
  Id = 'id',
  ComponentProps = 'props',
  ComponentContext = 'ctx',
}
