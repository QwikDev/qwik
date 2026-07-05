import type { Expression, FunctionBody, ParamPattern } from 'oxc-parser';
import type { SourceRange } from '../types';

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
  params: ParamPattern[];
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
  code: string;
}

export interface RenderResult {
  setup: SourceRange[];
  providesContext: boolean;
  html: HtmlPart[];
  root: number | null;
  refs: Ref[];
  ops: Op[];
  segments: Segment[];
}

export type AttributeHtmlPart = {
  kind: 'attr';
  target: number;
  name: string;
  expr: SourceRange;
};
export type TextHtmlPart = { kind: 'text'; expr: SourceRange };
export type MarkerHtmlPart = { kind: 'marker'; id: number };
export type HtmlHtmlPart = { kind: 'html'; value: string };

export type HtmlPart = HtmlHtmlPart | TextHtmlPart | AttributeHtmlPart | MarkerHtmlPart;

export type RefStep = 'firstChild' | 'lastChild' | 'nextSibling' | 'previousSibling';

export interface Ref {
  id: number;
  path: RefStep[];
}

export type Op =
  | { kind: 'textEffect'; marker: number; expr: SourceRange; trackedSource: SourceRange | null }
  | {
      kind: 'attrEffect';
      target: number;
      name: string;
      expr: SourceRange;
      trackedSource: SourceRange | null;
    }
  | { kind: 'event'; target: number; name: string; segment: string; captures: string[] };

export interface Segment {
  name: string;
  kind: 'event' | 'qrl' | 'component';
  expr: string;
  captures: string[];
}
