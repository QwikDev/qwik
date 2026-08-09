export const QWIK_IMPORT = '@qwik.dev/core';
export const QWIK_CORE_IMPORT = '@qwik.dev/core';

export const enum QwikWord {
  // csr
  CreateTemplate = 'createTemplate',
  CreateElementTemplate = '_createElementTemplate',
  CreateTextNodeEffect = 'createTextNodeEffect',
  CreateTextExpressionEffect = 'createTextExpressionEffect',
  CreateAttrEffect = 'createAttrEffect',
  CreateAttrExpressionEffect = 'createAttrExpressionEffect',
  CreateEventEffect = 'createEventEffect',
  CreatePropsEffect = 'createPropsEffect',
  CreateDomBatchEffect = 'createDomBatchEffect',
  ApplyDomProps = 'applyDomProps',
  PatchAttrValue = 'patchAttrValue',
  PatchTextValue = 'patchTextValue',
  ReadTrackedSourceValue = 'readTrackedSourceValue',
  ReadExpression = 'readExpression',
  CreateComponent = 'createComponent',
  MarkComponent = '_markComponent',
  CreatePropsProxy = 'createPropsProxy',
  CreateSlotScope = 'createSlotScope',
  RegisterProjection = 'registerProjection',
  CreateSlot = 'createSlot',
  CreateDynamicTag = 'createDynamicTag',
  MergeProps = 'mergeProps',
  Props = '_props',
  BranchRange = 'BranchRange',
  CreateBranch = 'createBranch',
  CreateSuspense = 'createSuspense',
  CreateContentBlock = 'createContentBlock',
  CreateCollection = 'createCollection',
  WrapArray = '_wrapArray',
  SetEvent = 'setEvent',
  SetRef = 'setRef',
  InlinedQrl = 'inlinedQrl',
  BindValueHandler = '_val',
  BindCheckedHandler = '_chk',
  WithCaptures = '_withCaptures',
  NextSibling = '_next',
  PreviousSibling = '_prev',
  FirstChild = '_first',
  LastChild = '_last',
  ToNodes = '_toNodes',
  // ssr
  CreateSsrElementTarget = 'createSsrElementTarget',
  CreateSsrElementTextTarget = 'createSsrElementTextTarget',
  CreateSsrDomBatchEffect = 'createSsrDomBatchEffect',
  CreateSsrNodeId = 'createSsrNodeId',
  CreateSsrRecord = 'createSsrRecord',
  CreateSsrElementRecord = 'createSsrElementRecord',
  RenderSsrAttr = 'renderSsrAttr',
  RenderSsrAttrExpression = 'renderSsrAttrExpression',
  RenderSsrEvent = 'renderSsrEvent',
  RenderSsrProps = 'renderSsrProps',
  CreateSsrRangeTextTarget = 'createSsrRangeTextTarget',
  RenderSsrTextNode = 'renderSsrTextNode',
  RenderSsrTextExpression = 'renderSsrTextExpression',
  RenderSsrBranch = 'renderSsrBranch',
  CreateSsrSuspense = 'createSsrSuspense',
  RenderSsrContent = 'renderSsrContent',
  RenderSsrCollection = 'renderSsrCollection',
  RenderSsrSlot = 'renderSsrSlot',
  GetActiveInvokeContextOrNull = 'getActiveInvokeContextOrNull',
  GetActiveInvokeContext = 'getActiveInvokeContext',
  EscapeHTML = 'escapeHTML',
  EscapeSsrContent = 'escapeSsrContent',
  MaybeThen = 'maybeThen',
  QrlWithChunk = '_qrlWithChunk',
  CreateVisibleTaskHandlerQrl = 'createVisibleTaskHandlerQrl',
  //shared
  ComponentQrl = 'componentQrl',
  Captures = '_captures',
  Await = '_await',
}

export const enum QwikGenWord {
  Effect = 'effect',
  Template = 'tmpl',
  Fragment = 'fragment',
  ComponentProps = 'props',
  ComponentContext = 'ctx',
  InvokeContext = 'invokeCtx',
  ContextScope = 'contextScope',
  Id = 'id',
  Element = 'el',
  PropQrl = 'propQrl',
  Text = 'text',
}

/**
 * Names the compiler emits as component and segment parameters. They are allocated per module so
 * they never collide with a binding the source already declares.
 */
export interface GeneratedNames {
  readonly props: string;
  readonly ctx: string;
  readonly invokeCtx: string;
}

export const DEFAULT_GENERATED_NAMES: GeneratedNames = {
  props: QwikGenWord.ComponentProps,
  ctx: QwikGenWord.ComponentContext,
  invokeCtx: QwikGenWord.InvokeContext,
};

export const enum QwikComments {
  TextMarker = '<!t>',
  TextMarkerEnd = '<!/t>',
}

export const enum QwikAttributes {
  Id = 'q:id',
  Row = 'q:row',
  BindPrefix = 'bind:',
  PassivePrefix = 'passive:',
  PreventDefaultPrefix = 'preventdefault:',
  StopPropagationPrefix = 'stoppropagation:',
}

export const enum QwikHooks {
  Dollar = '$',
  SyncDollar = 'sync$',
  ComponentDollar = 'component$',
  NativeDollar = 'native$',
  UseConstant = 'useConstant',
  UseSignal = 'useSignal',
  UseStore = 'useStore',
  UseServerData = 'useServerData',
  UseComputed = 'useComputed',
  UseComputedQrl = 'useComputedQrl',
  UseComputedDollar = 'useComputed$',
  UseAsync = 'useAsync',
  UseAsyncQrl = 'useAsyncQrl',
  UseAsyncDollar = 'useAsync$',
  UseSerializer = 'useSerializer',
  UseSerializerQrl = 'useSerializerQrl',
  UseSerializerDollar = 'useSerializer$',
  UseTask = 'useTask',
  UseTaskQrl = 'useTaskQrl',
  UseTaskDollar = 'useTask$',
  UseVisibleTask = 'useVisibleTask',
  UseVisibleTaskQrl = 'useVisibleTaskQrl',
  UseVisibleTaskDollar = 'useVisibleTask$',
  UseContext = 'useContext',
  UseContextProvider = 'useContextProvider',
  UseId = 'useId',
  UseStyles = 'useStyles',
  UseStylesQrl = 'useStylesQrl',
  UseStylesDollar = 'useStyles$',
  UseStylesScoped = 'useStylesScoped',
  UseStylesScopedQrl = 'useStylesScopedQrl',
  UseStylesScopedDollar = 'useStylesScoped$',
  UseOn = 'useOn',
  UseOnDocument = 'useOnDocument',
  UseOnWindow = 'useOnWindow',
  Jsx = 'jsx',
  Jsxs = 'jsxs',
  Slot = 'Slot',
  Suspense = 'Suspense',
  Fragment = 'Fragment',
}
