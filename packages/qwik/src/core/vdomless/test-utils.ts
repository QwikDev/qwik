import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format as formatCode } from 'prettier';
import ts from 'typescript';
import { transformModules } from '../../../../compiler/src/index';
import { createDocument } from '../../testing/document';
import { isJSXNode } from '../shared/jsx/jsx-node';
import type { JSXNodeInternal, JSXOutput } from '../shared/jsx/types/jsx-node';
import { QContainerValue, type Container } from '../shared/types';
import { QContainerAttr } from '../shared/utils/markers';
import { render as renderCsr, type CsrRenderRoot } from './csr-render';
import type { BranchRange } from './dom/branch/branch';
import { createTextExpressionEffect } from './dom/effect/effect';
import { ReactiveFlags } from './reactive/flags';
import { Phase, Scheduler } from './runtime/scheduler';
import {
  SubscriberKind,
  type DomSubscriber,
  type IdleSubscriber,
  type TaskSubscriber,
} from './runtime/subscriber';
import { createTask, createTaskGroup } from './runtime/task';
import { renderToString, type SsrRenderRoot } from '../../server/vdomless/ssr-render';

export const noopSchedule = (): void => {};

export interface RenderOptions {
  debug?: boolean;
  scheduler?: Scheduler;
}

export interface RenderResult {
  document: Document;
  container: HTMLElement;
  html: string;
  nodes: readonly Node[];
  scheduler: Scheduler;
  flush: () => Promise<void>;
  cleanup: () => void;
}

export function createText(data = ''): Text {
  return { data } as Text;
}

export function createNode(label: string): Node {
  return { label } as unknown as Node;
}

export function getNodeLabel(node: Node): string {
  return (node as unknown as { label: string }).label;
}

export function createBranchRange(): { range: BranchRange; replacements: Node[][] } {
  const replacements: Node[][] = [];
  return {
    range: {
      replace(nodes: readonly Node[]) {
        replacements.push([...nodes]);
      },
    },
    replacements,
  };
}

export interface TestParentNode extends Node {
  nodes: TestDomNode[];
}

export interface TestDomNode extends Node {
  label: string;
  parent: TestParentNode | null;
}

export interface TestDocumentFragment extends DocumentFragment {
  isTestFragment: true;
  nodes: TestDomNode[];
}

const testDocument = {
  createRange(): Range {
    let start: TestDomNode | null = null;
    let end: TestDomNode | null = null;

    return {
      setStartAfter(node: Node): void {
        start = node as TestDomNode;
      },
      setEndBefore(node: Node): void {
        end = node as TestDomNode;
      },
      deleteContents(): void {
        if (start === null || end === null) {
          throw new Error('Incomplete range');
        }

        const parent = start.parent;
        if (parent === null || parent !== end.parent) {
          throw new Error('Range markers must share parent');
        }

        let child = start.nextSibling as TestDomNode | null;
        while (child !== end) {
          if (child === null) {
            throw new Error('Range end not found');
          }

          const next = child.nextSibling as TestDomNode | null;
          parent.removeChild(child);
          child = next;
        }
      },
    } as unknown as Range;
  },
  createDocumentFragment(): DocumentFragment {
    return createTestDocumentFragment();
  },
} as Document;

function createTestDocumentFragment(): TestDocumentFragment {
  const fragment = {
    isTestFragment: true,
    nodes: [] as TestDomNode[],
    appendChild(node: Node): Node {
      const child = node as TestDomNode;
      const currentParent = child.parent;
      if (currentParent !== null) {
        currentParent.removeChild(child);
      }

      fragment.nodes.push(child);
      child.parent = null;
      return node;
    },
  } as unknown as TestDocumentFragment;

  return fragment;
}

function isTestDocumentFragment(node: Node): node is TestDocumentFragment {
  return (node as Partial<TestDocumentFragment>).isTestFragment === true;
}

export function createTestDomNode(label: string): TestDomNode {
  return {
    label,
    parent: null,
    get ownerDocument() {
      return testDocument;
    },
    get parentNode() {
      return this.parent;
    },
    get nextSibling() {
      const parent = this.parent;
      if (parent === null) {
        return null;
      }

      const index = parent.nodes.indexOf(this);
      return parent.nodes[index + 1] ?? null;
    },
  } as TestDomNode;
}

export function createTestParentNode(nodes: TestDomNode[]): TestParentNode {
  const parent = {
    nodes: [] as TestDomNode[],
    removeChild(node: Node): Node {
      const child = node as TestDomNode;
      const index = parent.nodes.indexOf(child);
      if (index === -1) {
        throw new Error('Missing child');
      }

      parent.nodes.splice(index, 1);
      child.parent = null;
      return node;
    },
    insertBefore(node: Node, before: Node | null): Node {
      if (isTestDocumentFragment(node)) {
        for (let i = 0; i < node.nodes.length; i++) {
          parent.insertBefore(node.nodes[i], before);
        }
        node.nodes.length = 0;
        return node;
      }

      const child = node as TestDomNode;
      const beforeIndex =
        before === null ? parent.nodes.length : parent.nodes.indexOf(before as TestDomNode);
      if (beforeIndex === -1) {
        throw new Error('Missing reference child');
      }

      const currentParent = child.parent;
      if (currentParent !== null) {
        currentParent.removeChild(child);
      }

      parent.nodes.splice(beforeIndex, 0, child);
      child.parent = parent;
      return node;
    },
  } as unknown as TestParentNode;

  for (let i = 0; i < nodes.length; i++) {
    parent.nodes.push(nodes[i]);
    nodes[i].parent = parent;
  }

  return parent;
}

export function createAttrTarget(): { element: Element; attrs: Map<string, string> } {
  const attrs = new Map<string, string>();
  return {
    element: {
      setAttribute(name: string, value: string) {
        attrs.set(name, value);
      },
    } as Element,
    attrs,
  };
}

export function createCaptureContainer(captures: Record<string, unknown>): Container {
  return {
    $getObjectById$: (id: number | string) => captures[String(id)],
  } as Container;
}

export function createTaskSubscriber(
  scheduler: Scheduler,
  label: string,
  order: string[],
  groupPath: readonly number[] = [0],
  index = 0
): TaskSubscriber {
  return createTask(() => order.push(label), {
    scheduler,
    group: createTaskGroup(groupPath),
    index,
  });
}

export function createOrderTextExpressionEffect(
  scheduler: Scheduler,
  phase: Phase.StructuralDom | Phase.ScalarDom,
  label: string,
  order: string[],
  orderIndex = 0
): DomSubscriber {
  return createTextExpressionEffect(
    createText(),
    [],
    () => {
      order.push(label);
      return label;
    },
    {
      scheduler,
      phase,
      order: orderIndex,
    }
  );
}

export function createIdleSubscriber(notify: () => void): IdleSubscriber {
  return {
    kind: SubscriberKind.Idle,
    job: {
      run() {},
    },
    flags: ReactiveFlags.None,
    schedulerEpoch: 0,
    notify,
  };
}

export type CsrRenderComponent = CsrRenderRoot;
export type SsrRenderComponent = SsrRenderRoot;

type RenderTarget = 'csr' | 'ssr';
type TransformModule = Awaited<ReturnType<typeof transformModules>>['modules'][number];

interface CompiledRoot<TRoot> {
  root: TRoot;
  modules: readonly TransformModule[];
}

interface CompiledInput {
  code: string;
  rootExportName: string;
}

interface ComponentDeclarationSource {
  name: string;
  initializer: string;
}

let compiledModuleId = 0;

export async function csrRender(jsx: JSXOutput, options?: RenderOptions): Promise<RenderResult> {
  const compiled = await compileJsxRoot<CsrRenderComponent>('csr', jsx);
  const document = createDocument();
  const container = document.createElement('div');
  document.body.appendChild(container);

  const scheduler = options?.scheduler ?? new Scheduler(noopSchedule, noopSchedule);
  const renderResult = await renderCsr(compiled.root, container);
  const nodes = Array.from(container.childNodes);
  const cleanup = createRenderCleanup(renderResult.cleanup, container);
  const result = createRenderResult(document, container, nodes, scheduler, cleanup);
  await result.flush();
  await debugRender('csr', compiled.modules, container.innerHTML, options);

  return {
    ...result,
    html: container.innerHTML,
  };
}

export async function ssrRender(jsx: JSXOutput, options?: RenderOptions): Promise<RenderResult> {
  const compiled = await compileJsxRoot<SsrRenderComponent>('ssr', jsx);
  const scheduler = options?.scheduler ?? new Scheduler(noopSchedule, noopSchedule);
  const result = await renderToString(compiled.root);
  await flushScheduler(scheduler);

  const { document, container } = createContainerDocument(result.html, QContainerValue.PAUSED);
  const nodes = Array.from(container.childNodes) as Node[];
  const cleanup = createRenderCleanup(noopSchedule, container);
  await debugRender('ssr', compiled.modules, container.innerHTML, options);

  return {
    ...createRenderResult(document, container, nodes, scheduler, cleanup),
    html: container.innerHTML,
  };
}

function createRenderResult(
  document: Document,
  container: HTMLElement,
  nodes: readonly Node[],
  scheduler: Scheduler,
  cleanup: () => void
): RenderResult {
  return {
    document,
    container,
    html: container.innerHTML,
    nodes,
    scheduler,
    flush: () => flushScheduler(scheduler),
    cleanup,
  };
}

function createRenderCleanup(dispose: () => void, container: HTMLElement): () => void {
  let cleaned = false;
  return () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    dispose();
    while (container.firstChild !== null) {
      container.removeChild(container.firstChild);
    }
  };
}

async function flushScheduler(scheduler: Scheduler): Promise<void> {
  await scheduler.flushInteraction();
  await scheduler.flushDeferred();
}

function createContainerDocument(
  html: string,
  containerState: QContainerValue
): { document: Document; container: HTMLElement } {
  const document = createDocument({
    html: `<html><body><div ${QContainerAttr}="${containerState}">${html}</div></body></html>`,
  });
  const container = document.body.firstElementChild as HTMLElement | null;
  if (container === null) {
    throw new Error('Missing render container');
  }

  return { document, container };
}

async function compileJsxRoot<TRoot extends CsrRenderComponent | SsrRenderComponent>(
  target: RenderTarget,
  jsx: JSXOutput
): Promise<CompiledRoot<TRoot>> {
  const id = compiledModuleId++;
  const inputPath = `src/render-test-${id}.tsx`;
  const input = await createCompiledInput(jsx);
  return importCompiledRoot<TRoot>(target, id, inputPath, input.code, input.rootExportName);
}

async function createCompiledInput(jsx: JSXOutput): Promise<CompiledInput> {
  const location = getJsxLocation(jsx);
  const file = resolveSourceFile(location.fileName);
  const source = await readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const jsxPosition = sourceFile.getPositionOfLineAndCharacter(
    location.lineNumber - 1,
    Math.max(location.columnNumber - 1, 0)
  );
  const componentName = getRenderedComponentName(sourceFile, jsxPosition);
  const components = getScopedComponentDeclarations(sourceFile, jsxPosition);
  if (!components.some((component) => component.name === componentName)) {
    components.push(getComponentDeclaration(sourceFile, componentName, jsxPosition));
  }
  const imports = getQwikCoreImports(sourceFile);
  const exports = components.map(
    (component) => `export const ${component.name} = ${component.initializer};`
  );

  return {
    code: `${imports.join('\n')}\n${exports.join('\n')}\n`,
    rootExportName: componentName,
  };
}

interface JsxLocation {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

function getJsxLocation(jsx: JSXOutput): JsxLocation {
  if (!isJSXNode(jsx)) {
    throw new Error('Render helper expects a JSX root.');
  }

  const dev = (jsx as JSXNodeInternal & { dev?: Partial<JsxLocation> }).dev;
  if (!dev?.fileName || dev.lineNumber === undefined || dev.columnNumber === undefined) {
    throw new Error('JSX render helper requires JSX dev metadata.');
  }

  return {
    fileName: dev.fileName,
    lineNumber: dev.lineNumber,
    columnNumber: dev.columnNumber,
  };
}

function getRenderedComponentName(sourceFile: ts.SourceFile, position: number): string {
  let name: string | null = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName;
      if (ts.isIdentifier(tagName)) {
        const start = node.getStart(sourceFile);
        const distance = position >= start && position <= node.end ? 0 : Math.abs(start - position);
        if (distance < bestDistance) {
          bestDistance = distance;
          name = tagName.text;
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (name === null) {
    throw new Error('Unable to locate JSX component at render call.');
  }
  return name;
}

function getScopedComponentDeclarations(
  sourceFile: ts.SourceFile,
  beforePosition: number
): ComponentDeclarationSource[] {
  const declarations = new Map<string, ComponentDeclarationSource>();
  const path = getNodePath(sourceFile, beforePosition);

  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      collectComponentDeclarations(sourceFile, node.statements, beforePosition, declarations);
    }
  }

  return Array.from(declarations.values());
}

function getNodePath(sourceFile: ts.SourceFile, position: number): ts.Node[] {
  const path: ts.Node[] = [];

  const visit = (node: ts.Node): void => {
    if (position < node.getFullStart() || position > node.end) {
      return;
    }
    path.push(node);
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return path;
}

function collectComponentDeclarations(
  sourceFile: ts.SourceFile,
  statements: ts.NodeArray<ts.Statement>,
  beforePosition: number,
  declarations: Map<string, ComponentDeclarationSource>
): void {
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!ts.isVariableStatement(statement) || statement.getStart(sourceFile) >= beforePosition) {
      continue;
    }
    for (let j = 0; j < statement.declarationList.declarations.length; j++) {
      const declaration = statement.declarationList.declarations[j];
      const component = createComponentDeclarationSource(sourceFile, declaration);
      if (component !== null) {
        declarations.set(component.name, component);
      }
    }
  }
}

function getComponentDeclaration(
  sourceFile: ts.SourceFile,
  componentName: string,
  beforePosition: number
): ComponentDeclarationSource {
  const match: { component?: ComponentDeclarationSource; position: number } = { position: -1 };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === componentName
    ) {
      const component = createComponentDeclarationSource(sourceFile, node);
      const position = node.getStart(sourceFile);
      if (component !== null && position < beforePosition && position > match.position) {
        match.component = component;
        match.position = position;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  const component = match.component;
  if (component === undefined) {
    throw new Error(`Unable to locate component$ declaration for ${componentName}.`);
  }
  return component;
}

function createComponentDeclarationSource(
  sourceFile: ts.SourceFile,
  declaration: ts.VariableDeclaration
): ComponentDeclarationSource | null {
  if (
    !ts.isIdentifier(declaration.name) ||
    declaration.initializer === undefined ||
    !isComponentDollarCall(declaration.initializer)
  ) {
    return null;
  }
  return {
    name: declaration.name.text,
    initializer: declaration.initializer.getText(sourceFile),
  };
}

function isComponentDollarCall(expression: ts.Expression): expression is ts.CallExpression {
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
    ? expression.expression.text === 'component$'
    : false;
}

function getQwikCoreImports(sourceFile: ts.SourceFile): string[] {
  const imports: string[] = [];

  for (let i = 0; i < sourceFile.statements.length; i++) {
    const statement = sourceFile.statements[i];
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@qwik.dev/core'
    ) {
      imports.push(statement.getText(sourceFile));
    }
  }

  if (imports.length === 0) {
    imports.push(`import { component$ } from '@qwik.dev/core';`);
  }

  return imports;
}

async function importCompiledRoot<TRoot extends CsrRenderComponent | SsrRenderComponent>(
  target: RenderTarget,
  id: number,
  inputPath: string,
  code: string,
  rootExportName: string
): Promise<CompiledRoot<TRoot>> {
  const result = await transformModules({
    input: [{ path: inputPath, code }],
    srcDir: 'src',
    rootDir: findRepoRoot(),
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
    isServer: target === 'ssr',
  });

  if (result.diagnostics.length > 0) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  }

  const dir = join(findRepoRoot(), 'temp', 'render', `${Date.now()}-${target}-${id}`);
  await mkdir(dir, { recursive: true });

  let entryPath: string | null = null;
  for (let i = 0; i < result.modules.length; i++) {
    const module = result.modules[i];
    const fileName = module.segment || module.isEntry ? basename(module.path) : 'entry.mjs';
    const filePath = join(dir, fileName);
    await writeFile(filePath, module.code);
    if (!module.segment && !module.isEntry) {
      entryPath = filePath;
    }
  }

  if (entryPath === null) {
    throw new Error('Compiler did not emit a root module.');
  }

  const imported = (await import(`${pathToFileURL(entryPath).href}?t=${Date.now()}`)) as Record<
    string,
    unknown
  >;
  const root = imported[rootExportName];
  if (typeof root !== 'function') {
    throw new Error(`Compiled test module does not export ${rootExportName}.`);
  }
  return {
    root: root as TRoot,
    modules: result.modules,
  };
}

function findRepoRoot() {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Unable to locate repository root.');
    }
    dir = parent;
  }
  return dir;
}

function resolveSourceFile(fileName: string): string {
  return isAbsolute(fileName) ? fileName : join(findRepoRoot(), fileName);
}

async function debugRender(
  target: RenderTarget,
  modules: readonly TransformModule[],
  html: string,
  options: RenderOptions | undefined
): Promise<void> {
  if (!options?.debug) {
    return;
  }

  const lines = [`\n==================== ${target.toUpperCase()} RENDER ====================`];
  lines.push(`\n-------------------- ${target.toUpperCase()} TRANSFORM --------------------`);
  for (let i = 0; i < modules.length; i++) {
    const module = modules[i];
    lines.push(`\n// ${module.path}`);
    lines.push(await formatDebugCode(module.code, 'babel'));
  }
  lines.push(`\n-------------------- ${target.toUpperCase()} HTML --------------------`);
  lines.push(await formatDebugCode(html, 'html'));
  lines.push('============================================================\n');
  debugLog(lines.join('\n'));
}

async function formatDebugCode(code: string, parser: 'babel' | 'html'): Promise<string> {
  try {
    return (await formatCode(code, { parser })).trimEnd();
  } catch {
    return code;
  }
}

function debugLog(message: string): void {
  // eslint-disable-next-line no-console
  console.log(message);
}
