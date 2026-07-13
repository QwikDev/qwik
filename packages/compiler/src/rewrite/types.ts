import type { Expression, FunctionBody } from 'oxc-parser';
import type { ParamRecord, SourceRange } from '../types';

export interface RewriteSourceFactoryImports {
  named: Set<string>;
  namespaces: Set<string>;
}

export interface RewriteContextProviderImports {
  named: Set<string>;
  namespaces: Set<string>;
}

export interface RewriteComponent {
  exported: boolean;
  declarationKind: 'function' | 'const' | 'defaultFunction' | 'defaultArrow';
  exportName: string | 'default';
  localName: string | null;
  params: ParamRecord[];
  body: FunctionBody | Expression;
  sourceFactoryImports: RewriteSourceFactoryImports;
  contextProviderImports: RewriteContextProviderImports;
}

export interface RewriteOutput {
  component: RewriteComponent;
  result: RenderResult;
}

export interface RewriteModule {
  imports: string[];
  localImports: string[];
  code: string;
}

export interface RenderResult {
  setup: SourceRange[];
  providesContext: boolean;
  html: HtmlPart[];
  roots: number[];
  refs: Ref[];
  ops: Op[];
  segments: Segment[];
  visibleTasks: Segment[];
}

export type AttributeHtmlPart = {
  kind: 'attr';
  target: number;
  name: string;
  expr: SourceRange;
};
export type EventHtmlPart = {
  kind: 'event';
  target: number;
  name: string;
  key: string;
};
export type DynamicJsxHtmlPart = { kind: 'dynamicJsx'; target: number; expr: SourceRange };
export type ComponentPropPart =
  | { kind: 'static'; name: string; value: StaticProp['value'] }
  | { kind: 'expression'; name: string; expr: SourceRange }
  | { kind: 'spread'; expr: SourceRange };
export type ComponentHtmlPart = {
  kind: 'component';
  target: number;
  name: string;
  props: ComponentPropPart[];
};
export type BranchHtmlPart = {
  kind: 'branch';
  target: number;
  condition: SegmentBinding;
  then: SegmentBinding;
  else: SegmentBinding | null;
};
export type ForHtmlPart = {
  kind: 'for';
  target: number;
  source: SourceRange;
  key: SegmentBinding;
  render: SegmentBinding;
  usesItemSignal: boolean;
  usesIndexSignal: boolean;
};
export type TextHtmlPart = { kind: 'elementText'; id: number } | { kind: 'rangeText'; id: number };
export type TargetHtmlPart = { kind: 'target'; id: number };
export type ChildrenHtmlPart = { kind: 'childrenStart' | 'childrenEnd'; target: number };
export type HtmlHtmlPart = { kind: 'html'; value: string; isStaticText?: true };

export type HtmlPart =
  | HtmlHtmlPart
  | DynamicJsxHtmlPart
  | ComponentHtmlPart
  | BranchHtmlPart
  | ForHtmlPart
  | AttributeHtmlPart
  | { kind: 'props'; target: number }
  | EventHtmlPart
  | TextHtmlPart
  | TargetHtmlPart
  | ChildrenHtmlPart;

export type RefStep = 'firstChild' | 'lastChild' | 'nextSibling' | 'previousSibling';

export interface Ref {
  id: number;
  path: RefStep[];
}

export interface SegmentBinding {
  segment: string;
  captures: string[];
}

export type ExpressionEffectBinding = SegmentBinding & { kind: 'expression' };

export interface StaticProp {
  name: string;
  value: string | number | boolean | null;
}

export type PropsExpressionPart =
  | { kind: 'static'; prop: StaticProp }
  | { kind: 'expression'; name: string; range: SourceRange }
  | { kind: 'spread'; range: SourceRange };

export type ValueEffectBinding = { kind: 'source'; range: SourceRange } | ExpressionEffectBinding;

export type TextEffectBinding = ValueEffectBinding | { kind: 'unsupported' };

export type EventBinding =
  | { kind: 'segment'; segment: string; captures: string[] }
  | { kind: 'value'; range: SourceRange };

export type TextEffectTarget =
  | { kind: 'element'; id: number; marker: number }
  // A null id targets the surrounding branch or root range.
  | { kind: 'range'; id: number | null; marker: number };

export type Op =
  | {
      kind: 'textEffect';
      target: TextEffectTarget;
      expr: SourceRange;
      binding: TextEffectBinding;
    }
  | {
      kind: 'attrEffect';
      target: number;
      name: string;
      expr: SourceRange;
      binding: ValueEffectBinding;
    }
  | {
      kind: 'propsEffect';
      target: number;
      binding: ExpressionEffectBinding;
    }
  | { kind: 'event'; target: number; name: string; key: string; binding: EventBinding };

export interface SegmentCapture {
  name: string;
  source: 'local' | 'param' | 'loop';
}

export interface Segment {
  id: string;
  parentId: string | null;
  name: string;
  kind:
    | 'event'
    | 'qrl'
    | 'expression'
    | 'branchCondition'
    | 'branchRender'
    | 'forKey'
    | 'forRender';
  ctxName: string;
  qwik: boolean;
  range: SourceRange;
  functionRange: SourceRange;
  calleeRange: SourceRange | null;
  argumentRanges: Array<SourceRange | null>;
  paramRanges: SourceRange[];
  bodyRange: SourceRange;
  bodyKind: 'block' | 'expression';
  // Ordered JSX attributes for a props expression. Later entries override earlier ones.
  propsParts?: PropsExpressionPart[];
  awaits: Array<{ range: SourceRange; argumentRange: SourceRange }>;
  captures: SegmentCapture[];
  moduleReferences: string[];
  // `null` is an intentionally empty branch renderer; `undefined` uses the source expression.
  render?: RenderResult | null;
}

export interface ModuleDeclaration {
  range: SourceRange;
  names: string[];
  exported: boolean;
}

export interface ExtractedQrls {
  segments: Segment[];
  moduleDeclarations: ModuleDeclaration[];
  componentReferences: string[];
}
