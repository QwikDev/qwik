export const QWIK_IMPORT = '@qwik.dev/core/spark';
export const QWIK_CORE_IMPORT = '@qwik.dev/core';

export const enum QwikWord {
  // csr
  CreateTemplate = 'createTemplate',
  CreateTextNodeEffect = 'createTextNodeEffect',
  CreateTextExpressionEffect = 'createTextExpressionEffect',
  CreateAttrEffect = 'createAttrEffect',
  CreateAttrExpressionEffect = 'createAttrExpressionEffect',
  CreatePropsEffect = 'createPropsEffect',
  CreateDomBatchEffect = 'createDomBatchEffect',
  ApplyDomProps = 'applyDomProps',
  PatchAttrValue = 'patchAttrValue',
  PatchTextValue = 'patchTextValue',
  ReadTrackedSourceValue = 'readTrackedSourceValue',
  RunDomBatchEffect = 'runDomBatchEffect',
  CreateComponent = 'createComponent',
  MergeProps = 'mergeProps',
  BranchRange = 'BranchRange',
  CreateBranch = 'createBranch',
  ForRange = 'ForRange',
  CreateForBlock = 'createForBlock',
  SetEvent = 'setEvent',
  WithCaptures = '_withCaptures',
  NextSibling = '_next',
  PreviousSibling = '_prev',
  FirstChild = '_first',
  LastChild = '_last',
  // ssr
  CreateSsrElementTarget = 'createSsrElementTarget',
  CreateSsrElementTextTarget = 'createSsrElementTextTarget',
  CreateSsrDomBatchEffect = 'createSsrDomBatchEffect',
  RenderSsrAttr = 'renderSsrAttr',
  RenderSsrAttrExpression = 'renderSsrAttrExpression',
  RenderSsrProps = 'renderSsrProps',
  CreateSsrRangeTextTarget = 'createSsrRangeTextTarget',
  RenderSsrTextNode = 'renderSsrTextNode',
  RenderSsrTextExpression = 'renderSsrTextExpression',
  RenderSsrBranch = 'renderSsrBranch',
  RenderSsrForBlock = 'renderSsrForBlock',
  EscapeHTML = 'escapeHTML',
  MaybeThen = 'maybeThen',
  PromiseAll = 'promiseAll',
  QrlWithChunk = '_qrlWithChunk',
  Captures = '_captures',
  Await = '_await',
  CreateVisibleTaskHandlerQrl = 'createVisibleTaskHandlerQrl',
}

export const enum QwikGenWord {
  Effect = 'effect',
  Template = 'tmpl',
  Fragment = 'fragment',
  ComponentProps = 'props',
  ComponentContext = 'ctx',
  Id = 'id',
  Element = 'el',
  Text = 'text',
}

export const enum QwikComments {
  TextMarker = '<!t>',
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
  Component = 'component$',
  UseSignal = 'useSignal',
  UseComputed = 'useComputed$',
  UseAsync = 'useAsync$',
  UseSerializer = 'useSerializer$',
  UseTask = 'useTask$',
  UseVisibleTask = 'useVisibleTask$',
  UseContextProvider = 'useContextProvider',
}
