import type {
  Diagnostic,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
} from '@qwik.dev/optimizer';

export type AnyNode = Record<string, any>;

export interface CompilerResult {
  module: TransformModule;
  diagnostics: Diagnostic[];
}

export interface CompilerContext {
  input: TransformModuleInput;
  options: TransformModulesOptions;
  program: AnyNode | null;
  manifest: RenderManifest;
  outputCode: string | null;
}

export interface RenderManifest {
  components: ComponentRecord[];
  diagnostics: Diagnostic[];
}

export interface ComponentRecord {
  exportName: string | 'default';
  localName: string | null;
  declarationKind: 'function' | 'const' | 'defaultFunction' | 'defaultArrow';
  params: ParamRecord[];
  jsx: AnyNode | null;
  root: RenderNode | null;
  supported: boolean;
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
