/** Emission vocabulary (the pipeline's `src/words.ts` peer) — grows as ops land. */

export const QWIK_CORE_IMPORT = '@qwik.dev/core';

export const enum QwikMarker {
  Dollar = '$',
  Component = 'component$',
}

/** Runtime names imported from `@qwik.dev/core`. */
export const enum QwikWord {
  // csr
  CreateCollection = 'createCollection',
  WrapArray = '_wrapArray',
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
  CreateEventEffect = 'createEventEffect',
  ReadTrackedSourceValue = 'readTrackedSourceValue',
  ReadExpression = 'readExpression',
  CreateSlot = 'createSlot',
  CreateSlotScope = 'createSlotScope',
  ForwardSlot = 'forwardSlot',
  RegisterProjection = 'registerProjection',
  CreateContentBlock = 'createContentBlock',
  CreateDynamicContent = 'createDynamicContent',
  RenderSsrDynamicContent = 'renderSsrDynamicContent',
  // ssr
  CreateSsrNodeId = 'createSsrNodeId',
  CreateSsrMarkup = 'createSsrMarkup',
  RenderSsrAttr = 'renderSsrAttr',
  RenderSsrAttrExpression = 'renderSsrAttrExpression',
  RenderSsrEvent = 'renderSsrEvent',
  TextValue = '_textValue',
  EscapeHTML = 'escapeHTML',
  RenderSsrTextExpression = 'renderSsrTextExpression',
  RenderSsrTextNode = 'renderSsrTextNode',
  RenderSsrCollection = 'renderSsrCollection',
  RenderSsrBranch = 'renderSsrBranch',
  RenderSsrSlot = 'renderSsrSlot',
  RenderSsrContent = 'renderSsrContent',
  MaybeThen = 'maybeThen',
  UseOn = 'useOn',
  UseOnDocument = 'useOnDocument',
  CreateVisibleTaskHandlerQrl = 'createVisibleTaskHandlerQrl',
  // shared
  CreateComponent = 'createComponent',
  CreatePropsProxy = 'createPropsProxy',
  MergeProps = 'mergeProps',
  Props = '_props',
  NoopQrl = '_noopQrl',
  Captures = '_captures',
  Await = '_await',
  Untrack = 'untrack',
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
  CollectionSource = 'collectionSource',
  Component = 'component',
  Content = 'content',
  Slot = 'slot',
  SlotName = 'slotName',
  SlotScope = 'slotScope',
  PropQrl = 'propQrl',
  RangeId = 'rangeId',
  Start = 'start',
  End = 'end',
  ComponentProps = 'props',
  ComponentContext = 'ctx',
  Attribute = 'attr',
  DefaultValue = 'defaultValue',
}

/** Authored hook names recognized in component setup. */
export const enum QwikHook {
  UseComputed = 'useComputed$',
  UseComputedQrl = 'useComputedQrl',
  UseSignal = 'useSignal',
  UseVisibleTask = 'useVisibleTask$',
}

/** Authored Qwik JSX directives recognized by the compiler. */
export const enum QwikDirective {
  Slot = 'q:slot',
}

/** Compiler-invented segment contexts — the exact legacy strings; authored names stay plain. */
/** Qwik marker attributes the generators stamp into markup. */
export const enum QwikAttr {
  Id = 'q:id',
  Row = 'q:row',
}

export const enum SegmentContext {
  JsxValue = 'jsx',
  Text = 'text',
  BranchCondition = 'branch:condition',
  BranchThen = 'branch:then',
  BranchElse = 'branch:else',
  ForKey = 'for:key',
  ForRender = 'for:render',
  CollectionSource = 'collection:source',
  Projection = 'slot:render',
  DynamicSlot = 'slot:dynamic',
}
