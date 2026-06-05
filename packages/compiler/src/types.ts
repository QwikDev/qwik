import type {
  Diagnostic,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
} from '@qwik.dev/optimizer';
import type {
  ArrowFunctionExpression,
  Function as OxcFunction,
  JSXElement,
  JSXFragment,
  Node,
  Program,
} from 'oxc-parser';

export type AstNode = Node;
export type AstFunction = OxcFunction | ArrowFunctionExpression;
export type AstJsxNode = JSXElement | JSXFragment;
export type SourceRange = [number, number];

export interface CompilerResult {
  module: TransformModule;
  diagnostics: Diagnostic[];
}

export interface CompilerContext {
  input: TransformModuleInput;
  options: TransformModulesOptions;
  program: Program | null;
  manifest: RenderManifest;
  outputCode: string | null;
}

export interface RenderManifest {
  components: ComponentRecord[];
  segments: SegmentRecord[];
  diagnostics: Diagnostic[];
}

export interface ComponentRecord {
  exportName: string | 'default';
  localName: string | null;
  declarationKind: 'function' | 'const' | 'defaultFunction' | 'defaultArrow';
  functionRange: SourceRange | null;
  qrlBoundary: string | null;
  segmentId: string | null;
  params: ParamRecord[];
  jsx: AstJsxNode | null;
  root: RenderNode | null;
  supported: boolean;
}

export interface SegmentRecord {
  id: string;
  kind: 'function' | 'eventHandler' | 'jsxProp';
  ctxName: string;
  range: SourceRange | null;
  parentId: string | null;
  params: ParamRecord[];
  captures: CaptureRecord[];
  captureMode: 'auto' | 'explicit';
  targetFunctionOwnerId: number;
  specialReferences: SpecialReferenceRecord[];
}

export interface CaptureRecord {
  name: string;
  symbolId: number;
  declRange: SourceRange | null;
  source: 'local' | 'param' | 'loop';
  readonlyConst?: boolean;
}

export interface SpecialReferenceRecord {
  kind: 'this' | 'arguments' | 'super' | 'new.target';
  range: SourceRange | null;
}

export interface ParamRecord {
  name: string | null;
}

export interface ElementNode {
  kind: 'element';
  tag: string;
  props: PropRecord[];
  children: RenderNode[];
}

export interface FragmentNode {
  kind: 'fragment';
  children: RenderNode[];
}

export interface TextNode {
  kind: 'text';
  value: string;
}

export interface ExprNode {
  kind: 'expr';
  role: 'text' | 'attr' | 'child';
  reason: string;
}

export type RenderNode = ElementNode | FragmentNode | TextNode | ExprNode;

export interface PropRecord {
  name: string;
  value: string | number | boolean | null;
}

export type PipelineStage = (ctx: CompilerContext) => void | Promise<void>;
