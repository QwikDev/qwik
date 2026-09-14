/** Emission vocabulary (the pipeline's `src/words.ts` peer) — grows as ops land. */

export const QWIK_CORE_IMPORT = '@qwik.dev/core';
/** `foo$` calls its `fooQrl` twin on the server and its `foo` twin on the client. */
export const QRL_SUFFIX = '$';
export const QRL_TWIN_SUFFIX = 'Qrl';

export const enum QwikMarker {
  Dollar = '$',
  Sync = 'sync$',
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
  CreateCapturedEvent = 'createCapturedEvent',
  BranchRange = 'BranchRange',
  CreateBranch = 'createBranch',
  WithCaptures = '_withCaptures',
  QrlSync = '_qrlSync',
  QrlWithChunk = '_qrlWithChunk',
  ToNodes = '_toNodes',
  CreateTextExpressionEffect = 'createTextExpressionEffect',
  CreateTextNodeEffect = 'createTextNodeEffect',
  CreateAttrEffect = 'createAttrEffect',
  CreatePropsEffect = 'createPropsEffect',
  CreateAttrExpressionEffect = 'createAttrExpressionEffect',
  PatchAttrValue = 'patchAttrValue',
  SetRef = 'setRef',
  InlinedQrl = 'inlinedQrl',
  BindValueHandler = '_val',
  BindCheckedHandler = '_chk',
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
  CreateSsrOpenTag = 'createSsrOpenTag',
  RenderSsrAttr = 'renderSsrAttr',
  RenderSsrProps = 'renderSsrProps',
  RenderSsrAttrExpression = 'renderSsrAttrExpression',
  SerializeAttrExpressionValue = 'serializeAttrExpressionValue',
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
  UseOnWindow = 'useOnWindow',
  CreateVisibleTaskHandlerQrl = 'createVisibleTaskHandlerQrl',
  // shared
  CreateComponent = 'createComponent',
  ImplicitFirstArg = 'implicit$FirstArg',
  CreateDynamicTag = 'createDynamicTag',
  RenderSsrDynamicTag = 'renderSsrDynamicTag',
  CreatePropsProxy = 'createPropsProxy',
  MergeProps = 'mergeProps',
  Props = '_props',
  NoopQrl = '_noopQrl',
  Captures = '_captures',
  Await = '_await',
  Untrack = 'untrack',
  Invoke = 'invoke',
  GetActiveInvokeContextOrNull = 'getActiveInvokeContextOrNull',
}

/** Name stems for generated locals. */
export const enum QwikGenWord {
  Template = 'tmpl',
  Fragment = 'fragment',
  Element = 'el',
  Text = 'text',
  Effect = 'effect',
  DomProps = 'domProps',
  Id = 'id',
  Marker = 'marker',
  Branch = 'branch',
  BranchId = 'branchId',
  Collection = 'collection',
  CollectionId = 'collectionId',
  CollectionSource = 'collectionSource',
  Component = 'component',
  Content = 'content',
  Tag = 'tag',
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
  InvokeContext = 'invokeCtx',
  ContextScope = 'contextScope',
}

/** Authored hook names recognized in component setup. */
export const enum QwikHook {
  UseComputed = 'useComputed$',
  UseComputedQrl = 'useComputedQrl',
  UseComputedFunction = 'useComputed',
  UseSignal = 'useSignal',
  UseStore = 'useStore',
  UseVisibleTask = 'useVisibleTask$',
  UseVisibleTaskQrl = 'useVisibleTaskQrl',
  UseVisibleTaskFunction = 'useVisibleTask',
  UseTask = 'useTask$',
  UseTaskQrl = 'useTaskQrl',
  UseTaskFunction = 'useTask',
  UseContextProvider = 'useContextProvider',
  UseStyles = 'useStyles$',
  UseStylesFunction = 'useStyles',
  UseStylesScoped = 'useStylesScoped$',
  UseStylesScopedFunction = 'useStylesScoped',
  UseSerializer = 'useSerializer$',
  UseSerializerQrl = 'useSerializerQrl',
  UseSerializerFunction = 'useSerializer',
}

/** Authored Qwik JSX directives recognized by the compiler. */
export const enum QwikDirective {
  Slot = 'q:slot',
  InnerHtml = 'dangerouslySetInnerHTML',
  Ref = 'ref',
  Value = 'value',
  BindValue = 'bind:value',
  BindChecked = 'bind:checked',
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
  DynamicTag = 'tag:dynamic',
}
