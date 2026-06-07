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
  modules: TransformModule[];
  diagnostics: Diagnostic[];
}

export interface CompilerContext {
  input: TransformModuleInput;
  options: TransformModulesOptions;
  emitTarget: 'ssr' | 'csr';
  program: Program | null;
  manifest: RenderManifest;
  outputModules: TransformModule[] | null;
}

export interface RenderManifest {
  components: ComponentRecord[];
  segments: SegmentRecord[];
  imports: ImportRecord[];
  diagnostics: Diagnostic[];
}

export interface ImportRecord {
  source: string;
  typeOnly: boolean;
  specifiers: ImportSpecifierRecord[];
}

export type ImportSpecifierRecord =
  | {
      kind: 'default';
      localName: string;
    }
  | {
      kind: 'namespace';
      localName: string;
    }
  | {
      kind: 'named';
      importedName: string;
      localName: string;
      typeOnly: boolean;
    };

export interface ComponentRecord {
  exportName: string | 'default';
  localName: string | null;
  declarationKind: 'function' | 'const' | 'defaultFunction' | 'defaultArrow';
  functionRange: SourceRange | null;
  qrlBoundary: string | null;
  segmentId: string | null;
  params: ParamRecord[];
  setupRanges: SourceRange[];
  jsx: AstJsxNode | null;
  root: RenderNode | null;
  supported: boolean;
}

export interface SegmentRecord {
  id: string;
  kind: 'function' | 'eventHandler' | 'jsxProp' | 'jsxText';
  ctxName: string;
  range: SourceRange | null;
  functionRange: SourceRange | null;
  paramRanges: SourceRange[];
  bodyRange: SourceRange | null;
  bodyKind: 'block' | 'expression';
  async: boolean;
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

export interface DynamicTextNode {
  kind: 'dynamicText';
  expressionRange: SourceRange;
  binding: DynamicBinding;
}

export interface ExprNode {
  kind: 'expr';
  role: 'text' | 'attr' | 'child';
  reason: string;
}

export type RenderNode = ElementNode | FragmentNode | TextNode | DynamicTextNode | ExprNode;

export type DynamicBinding =
  | {
      kind: 'source';
      sourceName: string;
      expressionRange: SourceRange;
    }
  | {
      kind: 'expression';
      expressionRange: SourceRange;
      qrlSegmentId: string;
    };

export interface PropRecord {
  name: string;
  value: string | number | boolean | null;
  qrlSegmentId?: string;
  binding?: Extract<DynamicBinding, { kind: 'source' }>;
}

export type PipelineStage = (ctx: CompilerContext) => void | Promise<void>;

export interface QrlSegmentOutput {
  id: string;
  symbolName: string;
  qrlVariableName: string;
  importPath: string;
  modulePath: string;
  segment: SegmentRecord;
}
