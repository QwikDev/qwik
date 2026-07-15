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
import type { SourceMap } from 'oxc-transform';

export type AstNode = Node;
export type AstFunction = OxcFunction | ArrowFunctionExpression;
export type AstJsxNode = JSXElement | JSXFragment;
export type SourceRange = [number, number];

export interface CompilerResult {
  modules: TransformModule[];
  diagnostics: Diagnostic[];
}

export interface CompilerContext {
  input: CompilerTransformInput;
  options: TransformModulesOptions;
  emitTarget: 'ssr' | 'csr';
  program: Program | null;
  diagnostics: Diagnostic[];
}

export interface CompilerTransformInput extends TransformModuleInput {
  /** Original TS/TSX source before normalization. Absent in focused phase unit tests. */
  originalCode?: string;
  /** Normalized JS+JSX -> original TSX map, created only when source maps are requested. */
  normalizationMap?: SourceMap | null;
}

export interface ParamRecord {
  name: string | null;
  bindingRange: SourceRange | null;
  defaultRange: SourceRange | null;
  propAliases: ParamPropAliasRecord[];
  canProjectProps: boolean;
}

export interface ParamPropAliasRecord {
  localName: string;
  propName: string;
}
