/** Emission vocabulary (the pipeline's `src/words.ts` peer) — grows as ops land. */

export const QWIK_CORE_IMPORT = '@qwik.dev/core';

/** Runtime names imported from `@qwik.dev/core`. */
export const enum QwikWord {
  // csr
  CreateCollection = 'createCollection',
  CreateElementTemplate = '_createElementTemplate',
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
  ToNodes = '_toNodes',
  CreateTextExpressionEffect = 'createTextExpressionEffect',
  CreateTextNodeEffect = 'createTextNodeEffect',
  CreateAttrEffect = 'createAttrEffect',
  CreateAttrExpressionEffect = 'createAttrExpressionEffect',
  ReadTrackedSourceValue = 'readTrackedSourceValue',
  ReadExpression = 'readExpression',
  // ssr
  CreateSsrNodeId = 'createSsrNodeId',
  CreateSsrElementTextTarget = 'createSsrElementTextTarget',
  CreateSsrRangeTextTarget = 'createSsrRangeTextTarget',
  CreateSsrElementTarget = 'createSsrElementTarget',
  RenderSsrAttr = 'renderSsrAttr',
  RenderSsrAttrExpression = 'renderSsrAttrExpression',
  TextValue = '_textValue',
  EscapeHTML = 'escapeHTML',
  RenderSsrTextExpression = 'renderSsrTextExpression',
  RenderSsrTextNode = 'renderSsrTextNode',
  RenderSsrCollection = 'renderSsrCollection',
  RenderSsrBranch = 'renderSsrBranch',
  MaybeThen = 'maybeThen',
  // shared
  CreateComponent = 'createComponent',
  Props = '_props',
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
  BranchId = 'branchId',
  Collection = 'collection',
  CollectionId = 'collectionId',
  Component = 'component',
  PropQrl = 'propQrl',
  RangeId = 'rangeId',
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

/** Compiler-invented segment contexts — the exact legacy strings; authored names stay plain. */
/** Qwik marker attributes the generators stamp into markup. */
export const enum QwikAttr {
  Id = 'q:id',
  Row = 'q:row',
}

export const enum SegmentContext {
  Text = 'text',
  BranchCondition = 'branch:condition',
  BranchThen = 'branch:then',
  BranchElse = 'branch:else',
  ForKey = 'for:key',
  ForRender = 'for:render',
  CollectionSource = 'collection:source',
}
