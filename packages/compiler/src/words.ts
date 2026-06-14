export enum QwikModule {
  Core = '@qwik.dev/core',
  Spark = '@qwik.dev/core/spark',
}

export enum QwikSymbol {
  Captures = '_captures',
  Component = 'component$',
  CreateAttrEffect = 'createAttrEffect',
  CreateClassEffect = 'createClassEffect',
  CreateContext = 'createContext',
  CreateContextProvider = 'createContextProvider',
  CreateSsrElementTarget = 'createSsrElementTarget',
  CreateSsrElementTextTarget = 'createSsrElementTextTarget',
  CreateSsrRangeTextTarget = 'createSsrRangeTextTarget',
  CreateStyleEffect = 'createStyleEffect',
  CreateTextExpressionEffect = 'createTextExpressionEffect',
  CreateTextNodeEffect = 'createTextNodeEffect',
  EscapeHTML = 'escapeHTML',
  InlinedQrl = 'inlinedQrl',
  QrlWithChunk = '_qrlWithChunk',
  RenderSsrAttr = 'renderSsrAttr',
  RenderSsrClass = 'renderSsrClass',
  RenderSsrStyle = 'renderSsrStyle',
  RenderSsrTextExpression = 'renderSsrTextExpression',
  RenderSsrTextNode = 'renderSsrTextNode',
  SetEvent = 'setEvent',
  WithCaptures = '_withCaptures',
}
