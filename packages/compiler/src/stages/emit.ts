import type { SegmentAnalysis } from '@qwik.dev/optimizer';
import { transform } from 'oxc-transform';
import { jsxEventToHtmlAttribute } from '../ast-utils';
import {
  createCsrImports,
  createNamedImport,
  createQwikSparkImport,
  createSsrImports,
} from '../imports';
import { createModule, getLang } from '../module-utils';
import type { CompilerContext } from '../types';
import type {
  BranchNode,
  ComponentPropRecord,
  ComponentRecord,
  PropRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
} from '../types';
import { QwikSymbol } from '../words';
import { emitCsrModule } from './emit-csr';
import { emitSsrModule } from './emit-ssr';
import {
  emitImports,
  hasDynamicAttrBinding,
  hasDynamicBinding,
  hasElementTextBinding,
  hasBranch,
  hasComponent,
  hasRangeTextBinding,
  hasSourceTextBinding,
  hasTextExpression,
  serializeAttrValue,
} from './emit-utils';
import {
  isImplicitDollarSegment,
  isRangeInside,
  transformDollarImports,
  transformImplicitDollarCode,
} from './implicit-dollar';

interface DomOutput {
  id: string;
  kind: 'node' | 'nodes';
}

export async function emitModules(ctx: CompilerContext) {
  if (ctx.manifest.diagnostics.length > 0) {
    return;
  }
  const supported = ctx.manifest.components.filter(
    (component) => component.supported && component.root !== null
  );
  if (supported.length === 0) {
    return;
  }

  const qrlSegments = collectQrlSegments(ctx, supported, ctx.emitTarget);
  const dynamicUsage = {
    hasDynamicBinding: supported.some(
      (component) => hasDynamicBinding(component.root) || component.providesContext
    ),
    hasSourceText: supported.some((component) => hasSourceTextBinding(component.root)),
    hasTextExpression: supported.some((component) => hasTextExpression(component.root)),
    hasDynamicAttr: supported.some((component) => hasDynamicAttrBinding(component.root)),
    hasBranch: supported.some((component) => hasBranch(component.root)),
    hasComponent: supported.some((component) => hasComponent(component.root)),
  };
  const ssrUsage = {
    ...dynamicUsage,
    hasElementText: supported.some((component) => hasElementTextBinding(component.root)),
    hasRangeText: supported.some((component) => hasRangeTextBinding(component.root)),
  };
  const transformedImports = transformDollarImports(ctx.manifest.imports, ctx.emitTarget);
  const csrRootQrlSegments =
    ctx.emitTarget === 'csr' ? collectCsrRootQrlSegments(supported, qrlSegments) : qrlSegments;
  const csrRootUsage = ctx.emitTarget === 'csr' ? collectCsrRootImportUsage(supported) : null;
  const imports =
    ctx.emitTarget === 'ssr'
      ? createSsrImports(transformedImports, qrlSegments, ssrUsage)
      : createCsrImports(transformedImports, csrRootQrlSegments, csrRootUsage!);
  const outputCode =
    ctx.emitTarget === 'ssr'
      ? emitSsrModule(supported, qrlSegments, ctx.manifest.segments, ctx.input.code, imports)
      : emitCsrModule(supported, qrlSegments, ctx.manifest.segments, ctx.input.code, imports);
  const modules = [createModule(ctx.input.path, outputCode)];

  for (const qrlSegment of qrlSegments.values()) {
    modules.push(await createQrlSegmentModule(ctx, qrlSegment, qrlSegments));
  }

  ctx.outputModules = modules;
}

function collectQrlSegments(
  ctx: CompilerContext,
  components: ComponentRecord[],
  emitTarget: CompilerContext['emitTarget']
): Map<string, QrlSegmentOutput> {
  const segmentById = new Map(ctx.manifest.segments.map((segment) => [segment.id, segment]));
  const qrlSegments = new Map<string, QrlSegmentOutput>();
  for (const component of components) {
    if (component.root) {
      collectNodeQrlSegments(ctx, component.root, segmentById, qrlSegments, emitTarget === 'ssr');
    }
    if (emitTarget === 'ssr') {
      collectComponentImplicitDollarSegments(ctx, component, qrlSegments);
    }
  }
  return qrlSegments;
}

function collectCsrRootQrlSegments(
  components: readonly ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>
): Map<string, QrlSegmentOutput> {
  const rootSegments = new Map<string, QrlSegmentOutput>();
  for (const component of components) {
    if (component.root) {
      collectCsrRootNodeQrlSegments(component.root, qrlSegments, rootSegments);
    }
  }
  return rootSegments;
}

function collectCsrRootNodeQrlSegments(
  node: RenderNode,
  qrlSegments: Map<string, QrlSegmentOutput>,
  rootSegments: Map<string, QrlSegmentOutput>
): void {
  if (node.kind === 'element') {
    for (const prop of node.props) {
      if (prop.qrlSegmentId) {
        collectExistingQrlSegment(prop.qrlSegmentId, qrlSegments, rootSegments);
      }
    }
    for (const child of node.children) {
      collectCsrRootNodeQrlSegments(child, qrlSegments, rootSegments);
    }
    return;
  }
  if (node.kind === 'fragment') {
    for (const child of node.children) {
      collectCsrRootNodeQrlSegments(child, qrlSegments, rootSegments);
    }
    return;
  }
  if (node.kind === 'component') {
    for (const child of node.children) {
      collectCsrRootNodeQrlSegments(child, qrlSegments, rootSegments);
    }
    return;
  }
  if (node.kind === 'branch') {
    collectExistingQrlSegment(node.thenSegmentId, qrlSegments, rootSegments);
    if (node.elseSegmentId) {
      collectExistingQrlSegment(node.elseSegmentId, qrlSegments, rootSegments);
    }
  }
}

function collectExistingQrlSegment(
  id: string,
  qrlSegments: Map<string, QrlSegmentOutput>,
  output: Map<string, QrlSegmentOutput>
): void {
  const qrlSegment = qrlSegments.get(id);
  if (qrlSegment) {
    output.set(id, qrlSegment);
  }
}

function collectCsrRootImportUsage(components: readonly ComponentRecord[]) {
  return {
    hasDynamicBinding: components.some(
      (component) => hasCsrRootDynamicBinding(component.root) || component.providesContext
    ),
    hasSourceText: components.some((component) => hasCsrRootSourceTextBinding(component.root)),
    hasTextExpression: components.some((component) => hasCsrRootTextExpression(component.root)),
    hasDynamicAttr: components.some((component) => hasCsrRootDynamicAttrBinding(component.root)),
    hasBranch: components.some((component) => hasCsrRootBranch(component.root)),
    hasComponent: components.some((component) => hasCsrRootComponent(component.root)),
  };
}

function hasCsrRootDynamicBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText' || node.kind === 'branch') {
    return true;
  }
  if (node.kind === 'element') {
    return node.props.some((prop) => prop.binding) || node.children.some(hasCsrRootDynamicBinding);
  }
  if (node.kind === 'component') {
    return (
      node.props.some((prop) => prop.expressionRange !== undefined) ||
      node.children.some(hasCsrRootDynamicBinding)
    );
  }
  if (node.kind === 'fragment') {
    return node.children.some(hasCsrRootDynamicBinding);
  }
  return false;
}

function hasCsrRootSourceTextBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
    return node.binding.kind === 'source';
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    return node.children.some(hasCsrRootSourceTextBinding);
  }
  return false;
}

function hasCsrRootTextExpression(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'dynamicText') {
    return node.binding.kind === 'expression';
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    return node.children.some(hasCsrRootTextExpression);
  }
  return false;
}

function hasCsrRootDynamicAttrBinding(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'element') {
    return (
      node.props.some((prop) => prop.binding) || node.children.some(hasCsrRootDynamicAttrBinding)
    );
  }
  if (node.kind === 'fragment' || node.kind === 'component') {
    return node.children.some(hasCsrRootDynamicAttrBinding);
  }
  return false;
}

function hasCsrRootBranch(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'branch') {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    return node.children.some(hasCsrRootBranch);
  }
  return false;
}

function hasCsrRootComponent(node: RenderNode | null): boolean {
  if (!node) {
    return false;
  }
  if (node.kind === 'component') {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'fragment') {
    return node.children.some(hasCsrRootComponent);
  }
  return false;
}

function collectComponentImplicitDollarSegments(
  ctx: CompilerContext,
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  for (const segment of ctx.manifest.segments) {
    if (
      isImplicitDollarSegment(segment) &&
      component.setupRanges.some((range) => isRangeInside(segment.range, range)) &&
      !isNestedInImplicitDollarSegment(segment, ctx.manifest.segments) &&
      !qrlSegments.has(segment.id)
    ) {
      qrlSegments.set(segment.id, createQrlSegmentOutput(ctx, segment));
    }
  }
}

function isNestedInImplicitDollarSegment(
  segment: SegmentRecord,
  segments: readonly SegmentRecord[]
) {
  return segments.some(
    (candidate) =>
      candidate !== segment &&
      isImplicitDollarSegment(candidate) &&
      isRangeInside(segment.range, candidate.functionRange)
  );
}

function collectNodeQrlSegments(
  ctx: CompilerContext,
  node: RenderNode,
  segmentById: Map<string, SegmentRecord>,
  qrlSegments: Map<string, QrlSegmentOutput>,
  includeTextExpressions: boolean
) {
  if (node.kind === 'element') {
    for (const prop of node.props) {
      if (prop.qrlSegmentId && !qrlSegments.has(prop.qrlSegmentId)) {
        const segment = segmentById.get(prop.qrlSegmentId);
        if (segment) {
          qrlSegments.set(prop.qrlSegmentId, createQrlSegmentOutput(ctx, segment));
        }
      }
    }
  }
  if (node.kind === 'branch') {
    if (includeTextExpressions) {
      collectSegmentById(ctx, node.conditionSegmentId, segmentById, qrlSegments);
    }
    collectSegmentById(ctx, node.thenSegmentId, segmentById, qrlSegments);
    if (node.elseSegmentId) {
      collectSegmentById(ctx, node.elseSegmentId, segmentById, qrlSegments);
    }
    for (const child of node.thenChildren) {
      collectNodeQrlSegments(ctx, child, segmentById, qrlSegments, includeTextExpressions);
    }
    for (const child of node.elseChildren) {
      collectNodeQrlSegments(ctx, child, segmentById, qrlSegments, includeTextExpressions);
    }
  }
  if (includeTextExpressions && node.kind === 'dynamicText' && node.binding.kind === 'expression') {
    collectSegmentById(ctx, node.binding.qrlSegmentId, segmentById, qrlSegments);
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    for (const child of node.children) {
      collectNodeQrlSegments(ctx, child, segmentById, qrlSegments, includeTextExpressions);
    }
  }
}

function collectSegmentById(
  ctx: CompilerContext,
  id: string,
  segmentById: Map<string, SegmentRecord>,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const segment = segmentById.get(id);
  if (segment && !qrlSegments.has(id)) {
    qrlSegments.set(id, createQrlSegmentOutput(ctx, segment));
  }
}

function createQrlSegmentOutput(ctx: CompilerContext, segment: SegmentRecord): QrlSegmentOutput {
  const symbolName = createSegmentSymbol(ctx, segment);
  const modulePath = createSegmentModulePath(ctx, symbolName);
  return {
    id: segment.id,
    symbolName,
    qrlVariableName: createQrlVariableName(symbolName),
    importPath: createSegmentImportPath(ctx, modulePath),
    modulePath,
    segment,
  };
}

function createSegmentModulePath(ctx: CompilerContext, symbolName: string) {
  return `${ctx.input.path}_${symbolName}.js`;
}

function createSegmentImportPath(ctx: CompilerContext, modulePath: string) {
  return `./${basename(modulePath).slice(0, -3)}${ctx.options.explicitExtensions ? '.js' : ''}`;
}

function createQrlVariableName(symbolName: string) {
  return `q_${symbolName}`;
}

async function createQrlSegmentModule(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const source = createQrlSegmentSource(ctx, qrlSegment, qrlSegments);
  const transformed = await transform(qrlSegment.modulePath, source, {
    lang: getLang(ctx.input.path),
    sourceType: 'module',
    cwd: ctx.options.rootDir,
    sourcemap: false,
  });

  return createModule(qrlSegment.modulePath, transformed.code, null, {
    isEntry: true,
    origPath: ctx.input.path,
    segment: createQrlSegmentAnalysis(ctx, qrlSegment),
  });
}

function createQrlSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  if (qrlSegment.segment.kind === 'branchRender') {
    return createBranchRenderSegmentSource(ctx, qrlSegment, qrlSegments);
  }

  const source = ctx.input.code;
  const captures = qrlSegment.segment.captures;
  const captureLine =
    captures.length > 0
      ? `  const ${captures
          .map((capture, index) => `${capture.name} = ${QwikSymbol.Captures}[${index}]`)
          .join(', ')};\n`
      : '';
  const params = qrlSegment.segment.paramRanges
    .map(([start, end]) => source.slice(start, end))
    .join(', ');
  const body = qrlSegment.segment.bodyRange
    ? transformImplicitDollarCode(
        source,
        qrlSegment.segment.bodyRange,
        ctx.manifest.segments,
        new Map([[qrlSegment.id, qrlSegment]]),
        ctx.emitTarget
      )
    : 'undefined';
  const bodyStatements =
    qrlSegment.segment.bodyKind === 'block' ? body.slice(1, -1).trim() : `return ${body};`;
  const sparkImports: QwikSymbol[] = [];
  if (captures.length > 0) {
    sparkImports.push(QwikSymbol.Captures);
  }
  if (usesIdentifier(bodyStatements, QwikSymbol.CreateContext)) {
    sparkImports.push(QwikSymbol.CreateContext);
  }
  const importLine =
    sparkImports.length > 0
      ? `${emitImports([createQwikSparkImport(...sparkImports)]).join('\n')}\n\n`
      : '';

  return `${importLine}export const ${qrlSegment.symbolName} = ${
    qrlSegment.segment.async ? 'async ' : ''
  }(${params}) => {
${captureLine}${indentBody(bodyStatements)}
};
`;
}

interface BranchRenderUsage {
  sparkImports: Set<QwikSymbol>;
  segmentImports: Map<string, QrlSegmentOutput>;
}

function createBranchRenderSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const children = findBranchRenderChildren(ctx, qrlSegment.id);
  if (children === null) {
    throw new Error(`Missing branch render IR for ${qrlSegment.id}.`);
  }

  const usage: BranchRenderUsage = {
    sparkImports: new Set(),
    segmentImports: new Map(),
  };
  const captures = qrlSegment.segment.captures;
  const emitter = new BranchRenderDomEmitter(qrlSegments, ctx.input.code, usage);
  const roots = children.flatMap((child) => emitter.emitRoot(child));
  const captureLine =
    captures.length > 0
      ? `const ${captures
          .map((capture, index) => `${capture.name} = ${QwikSymbol.Captures}[${index}]`)
          .join(', ')};`
      : '';
  const bodyStatements = [
    captureLine,
    emitter.toString(),
    `return [${emitReturnItems(roots).join(', ')}];`,
  ]
    .filter(Boolean)
    .join('\n');
  const imports = [];

  if (captures.length > 0) {
    usage.sparkImports.add(QwikSymbol.Captures);
  }
  if (usage.sparkImports.size > 0) {
    imports.push(createQwikSparkImport(...usage.sparkImports));
  }
  for (const segment of usage.segmentImports.values()) {
    imports.push(createNamedImport(segment.importPath, [segment.symbolName]));
  }

  const importLine = imports.length > 0 ? `${emitImports(imports).join('\n')}\n\n` : '';
  return `${importLine}export const ${qrlSegment.symbolName} = (ctx) => {
${indentBody(bodyStatements)}
};
`;
}

class BranchRenderDomEmitter {
  private counter = 0;
  private readonly lines: string[] = [];

  constructor(
    private qrlSegments: Map<string, QrlSegmentOutput>,
    private sourceCode: string,
    private usage: BranchRenderUsage
  ) {}

  emitRoot(node: RenderNode): DomOutput[] {
    if (node.kind === 'fragment') {
      return node.children.flatMap((child) => this.emitRoot(child));
    }
    return [this.emitNode(node)];
  }

  private emitNode(node: RenderNode): DomOutput {
    if (node.kind === 'children') {
      return { id: `(${node.propsName}.children ?? [])`, kind: 'nodes' };
    }
    if (node.kind === 'text') {
      const id = this.next('text');
      this.line(`const ${id} = ctx.document.createTextNode(${JSON.stringify(node.value)});`);
      return { id, kind: 'node' };
    }
    if (node.kind === 'dynamicText') {
      const id = this.next('text');
      const effectId = this.next('effect');
      this.line(`const ${id} = ctx.document.createTextNode('');`);
      if (node.binding.kind === 'source') {
        this.use(QwikSymbol.CreateTextNodeEffect);
        this.line(
          `const ${effectId} = ${QwikSymbol.CreateTextNodeEffect}(${id}, ${node.binding.sourceName}, { scheduler: ctx.scheduler });`
        );
      } else {
        const expression = this.sourceCode.slice(node.expressionRange[0], node.expressionRange[1]);
        this.use(QwikSymbol.CreateTextExpressionEffect);
        this.line(
          `const ${effectId} = ${QwikSymbol.CreateTextExpressionEffect}(${id}, [], () => ${expression}, { scheduler: ctx.scheduler });`
        );
      }
      this.line(`ctx.scheduler.notify(${effectId});`);
      return { id, kind: 'node' };
    }
    if (node.kind === 'element') {
      const id = this.next('el');
      this.line(`const ${id} = ctx.document.createElement(${JSON.stringify(node.tag)});`);
      for (const prop of node.props) {
        if (prop.binding) {
          const effectId = this.next('effect');
          this.line(this.emitDynamicAttrEffect(effectId, id, prop));
          this.line(`ctx.scheduler.notify(${effectId});`);
          continue;
        }
        if (prop.qrlSegmentId) {
          const qrlSegment = this.qrlSegments.get(prop.qrlSegmentId);
          if (qrlSegment) {
            this.use(QwikSymbol.SetEvent);
            this.importSegment(qrlSegment);
            this.line(
              `${QwikSymbol.SetEvent}(${id}, ${JSON.stringify(prop.name)}, ${this.emitEventHandler(
                qrlSegment
              )});`
            );
          }
          continue;
        }
        const attr = serializeAttrValue(prop.value);
        if (attr !== null) {
          this.line(`${id}.setAttribute(${JSON.stringify(prop.name)}, ${JSON.stringify(attr)});`);
        }
      }
      for (const child of node.children) {
        this.appendChild(id, this.emitNode(child));
      }
      return { id, kind: 'node' };
    }
    if (node.kind === 'component') {
      const id = this.next('cmp');
      const props = this.emitComponentProps(node.props, node.children);
      this.use(QwikSymbol.CreateComponent);
      this.line(
        `const ${id} = ${QwikSymbol.CreateComponent}(${props}, (props) => ${node.name}(props, ctx), { container: ctx });`
      );
      return { id, kind: 'nodes' };
    }
    if (node.kind === 'branch') {
      return this.emitBranch(node);
    }
    if (node.kind === 'fragment') {
      const id = this.next('fragment');
      this.line(`const ${id} = ctx.document.createDocumentFragment();`);
      for (const child of node.children) {
        this.appendChild(id, this.emitNode(child));
      }
      return { id, kind: 'node' };
    }
    throw new Error(node.reason);
  }

  private emitComponentProps(
    props: ComponentPropRecord[],
    children: readonly RenderNode[]
  ): string {
    const entries = props.map((prop) => {
      if (prop.expressionRange !== undefined) {
        const value = this.sourceCode.slice(prop.expressionRange[0], prop.expressionRange[1]);
        return `get ${JSON.stringify(prop.name)}() { return ${value}; }`;
      }
      return `${JSON.stringify(prop.name)}: ${JSON.stringify(prop.value)}`;
    });
    if (children.length > 0) {
      entries.push(
        `${JSON.stringify('children')}: [${emitReturnItems(
          children.flatMap((child) => this.emitRoot(child))
        ).join(', ')}]`
      );
    }
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
  }

  private appendChild(parent: string, child: DomOutput): void {
    if (child.kind === 'nodes') {
      this.line(`for (const child of ${child.id}) ${parent}.appendChild(child);`);
    } else {
      this.line(`${parent}.appendChild(${child.id});`);
    }
  }

  private emitBranch(node: BranchNode): DomOutput {
    const fragmentId = this.next('fragment');
    const startId = this.next('comment');
    const endId = this.next('comment');
    const branchId = this.next('branch');
    const condition = this.sourceCode.slice(node.conditionRange[0], node.conditionRange[1]);
    const thenRenderer = this.emitBranchRenderer(node.thenSegmentId);
    const elseRenderer = node.elseSegmentId
      ? this.emitBranchRenderer(node.elseSegmentId)
      : 'undefined';

    this.use(QwikSymbol.CreateBranch);
    this.use(QwikSymbol.CreateBranchRange);
    this.line(`const ${fragmentId} = ctx.document.createDocumentFragment();`);
    this.line(`const ${startId} = ctx.document.createComment('b');`);
    this.line(`const ${endId} = ctx.document.createComment('/b');`);
    this.line(`${fragmentId}.appendChild(${startId});`);
    this.line(`${fragmentId}.appendChild(${endId});`);
    this.line(
      `const ${branchId} = ${QwikSymbol.CreateBranch}(${QwikSymbol.CreateBranchRange}(${startId}, ${endId}), [], () => ${condition}, ${thenRenderer}, ${elseRenderer}, { scheduler: ctx.scheduler, container: ctx });`
    );
    this.line(`ctx.scheduler.notify(${branchId});`);
    return { id: fragmentId, kind: 'node' };
  }

  private emitBranchRenderer(segmentId: string): string {
    const qrlSegment = this.qrlSegments.get(segmentId);
    if (!qrlSegment) {
      throw new Error(`Missing branch render segment ${segmentId}.`);
    }
    this.importSegment(qrlSegment);
    return this.emitCapturedFunction(qrlSegment);
  }

  private emitDynamicAttrEffect(effectId: string, elementId: string, prop: PropRecord): string {
    const sourceName = prop.binding!.sourceName;
    if (prop.name === 'class') {
      this.use(QwikSymbol.CreateClassEffect);
      return `const ${effectId} = ${QwikSymbol.CreateClassEffect}(${elementId}, ${sourceName}, { scheduler: ctx.scheduler });`;
    }
    if (prop.name === 'style') {
      this.use(QwikSymbol.CreateStyleEffect);
      return `const ${effectId} = ${QwikSymbol.CreateStyleEffect}(${elementId}, ${sourceName}, { scheduler: ctx.scheduler });`;
    }
    this.use(QwikSymbol.CreateAttrEffect);
    return `const ${effectId} = ${QwikSymbol.CreateAttrEffect}(${elementId}, ${JSON.stringify(
      prop.name
    )}, ${sourceName}, { scheduler: ctx.scheduler });`;
  }

  private emitEventHandler(qrlSegment: QrlSegmentOutput) {
    return this.emitCapturedFunction(qrlSegment);
  }

  private emitCapturedFunction(qrlSegment: QrlSegmentOutput) {
    if (qrlSegment.segment.captures.length === 0) {
      return qrlSegment.symbolName;
    }
    this.use(QwikSymbol.WithCaptures);
    return `${QwikSymbol.WithCaptures}(${qrlSegment.symbolName}, [${qrlSegment.segment.captures
      .map((capture) => capture.name)
      .join(', ')}])`;
  }

  private use(symbol: QwikSymbol): void {
    this.usage.sparkImports.add(symbol);
  }

  private importSegment(qrlSegment: QrlSegmentOutput): void {
    this.usage.segmentImports.set(qrlSegment.id, qrlSegment);
  }

  private line(code: string): void {
    this.lines.push(code);
  }

  toString() {
    return this.lines.join('\n');
  }

  private next(prefix: string) {
    const id = `${prefix}${this.counter}`;
    this.counter++;
    return id;
  }
}

function findBranchRenderChildren(
  ctx: CompilerContext,
  segmentId: string
): readonly RenderNode[] | null {
  for (const component of ctx.manifest.components) {
    if (component.root === null) {
      continue;
    }
    const children = findBranchRenderChildrenInNode(component.root, segmentId);
    if (children !== null) {
      return children;
    }
  }
  return null;
}

function findBranchRenderChildrenInNode(
  node: RenderNode,
  segmentId: string
): readonly RenderNode[] | null {
  if (node.kind === 'branch') {
    if (node.thenSegmentId === segmentId) {
      return node.thenChildren;
    }
    if (node.elseSegmentId === segmentId) {
      return node.elseChildren;
    }
    for (const child of node.thenChildren) {
      const children = findBranchRenderChildrenInNode(child, segmentId);
      if (children !== null) {
        return children;
      }
    }
    for (const child of node.elseChildren) {
      const children = findBranchRenderChildrenInNode(child, segmentId);
      if (children !== null) {
        return children;
      }
    }
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    for (const child of node.children) {
      const children = findBranchRenderChildrenInNode(child, segmentId);
      if (children !== null) {
        return children;
      }
    }
  }
  return null;
}

function emitReturnItems(outputs: readonly DomOutput[]): string[] {
  return outputs.map((output) => (output.kind === 'nodes' ? `...${output.id}` : output.id));
}

function indentBody(body: string) {
  if (!body) {
    return '';
  }
  return body
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function usesIdentifier(source: string, name: string) {
  const pattern = new RegExp(`\\b${name}\\b`);
  return pattern.test(source);
}

function createQrlSegmentAnalysis(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput
): SegmentAnalysis {
  const segment = qrlSegment.segment;
  const loc = segment.range ?? segment.functionRange ?? [0, 0];
  return {
    origin: basename(ctx.input.path),
    name: qrlSegment.symbolName,
    entry: null,
    displayName: qrlSegment.symbolName,
    hash: segment.id,
    canonicalFilename: `${basename(ctx.input.path)}_${qrlSegment.symbolName}`,
    extension: 'js',
    parent: null,
    ctxKind: segment.kind === 'eventHandler' ? 'eventHandler' : 'function',
    ctxName: segment.ctxName,
    captures: segment.captures.length > 0,
    loc,
    paramNames: segment.params.map((param) => param.name ?? '_'),
    captureNames:
      segment.captures.length > 0 ? segment.captures.map((capture) => capture.name) : undefined,
  };
}

function createSegmentSymbol(ctx: CompilerContext, segment: SegmentRecord) {
  const sourceName = basename(ctx.input.path).replace(/\.[cm]?[jt]sx?$/, '');
  return sanitizeIdentifier(`${sourceName}_${formatSegmentContextName(segment)}_${segment.id}`);
}

function formatSegmentContextName(segment: SegmentRecord) {
  if (segment.kind === 'eventHandler') {
    return jsxEventToHtmlAttribute(segment.ctxName) ?? segment.ctxName;
  }
  return segment.ctxName;
}

function sanitizeIdentifier(value: string) {
  const sanitized = value.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

function basename(path: string) {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}
