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
  exported: boolean;
  functionRange: SourceRange | null;
  qrlBoundary: string | null;
  providesContext: boolean;
  idBase: string;
  needsId: boolean;
  segmentId: string | null;
  useIdNames: string[];
  styles: StyleHookRecord[];
  params: ParamRecord[];
  setupRanges: SourceRange[];
  jsxValues: JsxValueRecord[];
  jsx: AstJsxNode | null;
  root: RenderNode | null;
  supported: boolean;
}

export interface StyleHookRecord {
  scoped: boolean;
  callRange: SourceRange;
  argRange: SourceRange;
  standalone: boolean;
  styleId: string;
}

export interface JsxValueRecord {
  name: string;
  factoryName: string;
  expressionRange: SourceRange;
  jsx: AstJsxNode;
  root: RenderNode | null;
}

export interface SegmentRecord {
  id: string;
  kind:
    | 'function'
    | 'eventHandler'
    | 'jsxProp'
    | 'jsxSpreadProps'
    | 'jsxText'
    | 'branchCondition'
    | 'branchRender'
    | 'forKey'
    | 'forRender'
    | 'slotRender';
  ctxName: string;
  range: SourceRange | null;
  calleeRange: SourceRange | null;
  calleeNameRange: SourceRange | null;
  calleeName: string | null;
  functionRange: SourceRange | null;
  argumentRanges: Array<SourceRange | null>;
  paramRanges: SourceRange[];
  bodyRange: SourceRange | null;
  bodyKind: 'block' | 'expression';
  async: boolean;
  awaitRanges: SourceRange[];
  parentId: string | null;
  params: ParamRecord[];
  captures: CaptureRecord[];
  moduleImports: ModuleImportRecord[];
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

export interface ModuleImportRecord {
  name: string;
  symbolId: number;
  declRange: SourceRange | null;
}

export interface SpecialReferenceRecord {
  kind: 'this' | 'arguments' | 'super' | 'new.target';
  range: SourceRange | null;
}

export interface ParamRecord {
  name: string | null;
  bindingRange: SourceRange | null;
  defaultRange: SourceRange | null;
  propAliases: ParamPropAliasRecord[];
  canRewriteProps: boolean;
}

export interface ParamPropAliasRecord {
  localName: string;
  propName: string;
}

export interface ElementNode {
  kind: 'element';
  tag: string;
  propsSegmentId: string | null;
  props: PropRecord[];
  children: RenderNode[];
}

export interface ComponentNode {
  kind: 'component';
  name: string;
  props: ComponentPropRecord[];
  slots: ComponentSlotRecord[];
}

export interface FragmentNode {
  kind: 'fragment';
  children: RenderNode[];
}

export interface ChildrenNode {
  kind: 'children';
  propsName: string;
}

export interface SlotNode {
  kind: 'slot';
  name: string;
  fallbackSegmentId: string | null;
  children: RenderNode[];
}

export interface ComponentSlotRecord {
  name: string;
  segmentId: string;
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

export interface DynamicJsxNode {
  kind: 'dynamicJsx';
  expressionRange: SourceRange;
}

export interface BranchNode {
  kind: 'branch';
  expressionRange: SourceRange;
  conditionRange: SourceRange;
  conditionSegmentId: string;
  thenSegmentId: string;
  elseSegmentId?: string;
  thenChildren: RenderNode[];
  elseChildren: RenderNode[];
}

export interface ForNode {
  kind: 'for';
  expressionRange: SourceRange;
  sourceName: string;
  keySegmentId: string;
  renderSegmentId: string;
  children: RenderNode[];
  usesItemSignal: boolean;
  usesIndexSignal: boolean;
}

export type RenderNode =
  | ElementNode
  | ComponentNode
  | FragmentNode
  | ChildrenNode
  | SlotNode
  | TextNode
  | DynamicTextNode
  | DynamicJsxNode
  | BranchNode
  | ForNode;

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

export type PropRecord = NamedPropRecord | SpreadPropRecord;

export interface NamedPropRecord {
  kind: 'named';
  name: string;
  value: string | number | boolean | null;
  expressionRange?: SourceRange;
  qrlSegmentId?: string;
  binding?: DynamicBinding;
}

export interface SpreadPropRecord {
  kind: 'spread';
  expressionRange: SourceRange;
}

export type ComponentPropRecord = ComponentNamedPropRecord | ComponentSpreadPropRecord;

export interface ComponentNamedPropRecord {
  kind: 'named';
  name: string;
  value?: string | number | boolean | null;
  expressionRange?: SourceRange;
  qrlSegmentId?: string;
}

export interface ComponentSpreadPropRecord {
  kind: 'spread';
  expressionRange: SourceRange;
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
