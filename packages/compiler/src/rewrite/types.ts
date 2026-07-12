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
  segment: string;
};
export type TextHtmlPart = { kind: 'text'; expr: SourceRange };
export type MarkerHtmlPart = { kind: 'marker'; id: number };
export type HtmlHtmlPart = { kind: 'html'; value: string };

export type HtmlPart =
  | HtmlHtmlPart
  | TextHtmlPart
  | AttributeHtmlPart
  | EventHtmlPart
  | MarkerHtmlPart;

export type RefStep = 'firstChild' | 'lastChild' | 'nextSibling' | 'previousSibling';

export interface Ref {
  id: number;
  path: RefStep[];
}

export type TextEffectBinding =
  | { kind: 'source'; range: SourceRange }
  | { kind: 'expression'; segment: string; captures: string[] }
  | { kind: 'unsupported' };

export type Op =
  | {
      kind: 'textEffect';
      marker: number;
      expr: SourceRange;
      binding: TextEffectBinding;
    }
  | {
      kind: 'attrEffect';
      target: number;
      name: string;
      expr: SourceRange;
      trackedSource: SourceRange | null;
    }
  | { kind: 'event'; target: number; name: string; segment: string; captures: string[] };

export interface SegmentCapture {
  name: string;
  source: 'local' | 'param' | 'loop';
}

export interface Segment {
  id: string;
  parentId: string | null;
  name: string;
  kind: 'event' | 'qrl' | 'expression';
  ctxName: string;
  qwik: boolean;
  range: SourceRange;
  functionRange: SourceRange;
  calleeRange: SourceRange | null;
  argumentRanges: Array<SourceRange | null>;
  paramRanges: SourceRange[];
  bodyRange: SourceRange;
  bodyKind: 'block' | 'expression';
  awaits: Array<{ range: SourceRange; argumentRange: SourceRange }>;
  captures: SegmentCapture[];
  moduleReferences: string[];
}

export interface ModuleDeclaration {
  range: SourceRange;
  names: string[];
  exported: boolean;
}

export interface ExtractedQrls {
  segments: Segment[];
  moduleDeclarations: ModuleDeclaration[];
}
