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
  BranchRange = 'BranchRange',
  CreateBranch = 'createBranch',
  WithCaptures = '_withCaptures',
  QrlWithChunk = '_qrlWithChunk',
  CreateTextExpressionEffect = 'createTextExpressionEffect',
  CreateTextNodeEffect = 'createTextNodeEffect',
  CreateAttrEffect = 'createAttrEffect',
  CreateAttrExpressionEffect = 'createAttrExpressionEffect',
  // ssr
  CreateSsrNodeId = 'createSsrNodeId',
  CreateSsrElementTextTarget = 'createSsrElementTextTarget',
  CreateSsrRangeTextTarget = 'createSsrRangeTextTarget',
  CreateSsrElementTarget = 'createSsrElementTarget',
  RenderSsrAttr = 'renderSsrAttr',
  RenderSsrAttrExpression = 'renderSsrAttrExpression',
  EscapeHTML = 'escapeHTML',
  RenderSsrTextExpression = 'renderSsrTextExpression',
  RenderSsrTextNode = 'renderSsrTextNode',
  RenderSsrBranch = 'renderSsrBranch',
  MaybeThen = 'maybeThen',
  // shared
  NoopQrl = '_noopQrl',
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
  Branch = 'branch',
  BranchId = 'branch_id',
  Start = 'start',
  End = 'end',
  ComponentProps = 'props',
  ComponentContext = 'ctx',
  Attribute = 'attr',
}

/** Authored hook names recognized in component setup. */
export const enum QwikHook {
  UseSignal = 'useSignal',
}
