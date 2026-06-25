import type { SegmentAnalysis } from '@qwik.dev/optimizer';
import { transform } from 'oxc-transform';
import { getRange, jsxEventToHtmlAttribute } from '../ast-utils';
import {
  createCsrImports,
  createNamedImport,
  createQwikSparkImport,
  createSsrImports,
  normalizeImports,
  type SsrImportUsage,
} from '../imports';
import { createModule, getLang } from '../module-utils';
import type { CompilerContext } from '../types';
import type {
  ComponentRecord,
  ElementNode,
  ImportRecord,
  QrlSegmentOutput,
  RenderNode,
  SegmentRecord,
} from '../types';
import { QwikSymbol } from '../words';
import {
  DomEmitter,
  canEmitTemplateRoot,
  emitCsrModule,
  emitNodeOutputExpression,
} from './emit-csr';
import { emitSsrDomPropsExpression, emitSsrModule, SsrEmitter } from './emit-ssr';
import {
  countScalarDomEffects,
  emitImports,
  emitSsrQrlPrelude,
  hasAttrExpressionBinding,
  hasCapturedCsrFunction,
  hasCapturedDomPropsEvent,
  hasComponentPropsSpread,
  hasDomPropsBinding,
  hasDynamicAttrBinding,
  hasDynamicBinding,
  hasElementTextBinding,
  hasBranch,
  hasForBlock,
  hasComponent,
  hasRangeTextBinding,
  hasSourceTextBinding,
  hasTextExpression,
  rewriteLoopCaptures,
  shouldResolveSsrQrl,
} from './emit-utils';
import {
  isImplicitDollarSegment,
  isRangeInside,
  transformDollarImports,
  transformImplicitDollarCode,
} from './implicit-dollar';

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
  const exportedComponents = supported.filter((component) => component.exported);
  const localComponents = supported.filter((component) => !component.exported);
  const mainQrlSegments = collectQrlSegments(ctx, exportedComponents, ctx.emitTarget, false);
  const imports = createModuleImports(ctx, exportedComponents, mainQrlSegments);
  const outputCode =
    ctx.emitTarget === 'ssr'
      ? emitSsrModule(
          exportedComponents,
          mainQrlSegments,
          ctx.manifest.segments,
          ctx.input.code,
          imports,
          createModulePrelude(ctx, exportedComponents, mainQrlSegments)
        )
      : emitCsrModule(
          exportedComponents,
          mainQrlSegments,
          ctx.manifest.segments,
          ctx.input.code,
          imports,
          createModulePrelude(ctx, exportedComponents, mainQrlSegments)
        );
  const modules = [createModule(ctx.input.path, outputCode)];

  for (const component of localComponents) {
    modules.push(await createComponentModule(ctx, component));
  }

  for (const qrlSegment of qrlSegments.values()) {
    modules.push(await createQrlSegmentModule(ctx, qrlSegment, qrlSegments));
  }

  ctx.outputModules = modules;
}

function createModuleImports(
  ctx: CompilerContext,
  components: readonly ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const transformedImports = transformDollarImports(ctx.manifest.imports, ctx.emitTarget);
  const componentImports = components.flatMap((component) =>
    createComponentReferenceImports(ctx, component.root!, component)
  );
  const baseImports = [...transformedImports, ...componentImports];
  if (ctx.emitTarget === 'ssr') {
    return createSsrImports(
      baseImports,
      qrlSegments,
      createSsrImportUsage(
        components.map((component) => ({
          root: component.root,
          providesContext: component.providesContext,
        }))
      )
    );
  }

  return createCsrImports(
    baseImports,
    collectCsrRootQrlSegments(components, qrlSegments),
    collectCsrRootImportUsage(components, qrlSegments)
  );
}

interface SsrUsageRoot {
  root: RenderNode | null;
  providesContext?: boolean;
}

function createSsrImportUsage(roots: readonly SsrUsageRoot[]): SsrImportUsage {
  const items = roots.map((item) => ({
    ...item,
    domEffectCount: countScalarDomEffects(item.root),
  }));
  const has = (predicate: (node: RenderNode | null) => boolean) =>
    items.some((item) => predicate(item.root));
  const hasBatched = (predicate: (node: RenderNode | null) => boolean) =>
    items.some((item) => item.domEffectCount > 1 && predicate(item.root));
  const hasScalar = (predicate: (node: RenderNode | null) => boolean) =>
    items.some((item) => item.domEffectCount <= 1 && predicate(item.root));

  return {
    hasDynamicBinding: items.some(
      (item) => hasDynamicBinding(item.root) || item.providesContext === true
    ),
    hasDomBatch: items.some((item) => item.domEffectCount > 1),
    hasDomBatchSourceText: hasBatched(hasSourceTextBinding),
    hasDomBatchTextExpression: hasBatched(hasTextExpression),
    hasDomBatchDynamicAttr: hasBatched(hasDynamicAttrBinding),
    hasDomBatchAttrExpression: hasBatched(hasAttrExpressionBinding),
    hasDomBatchProps: hasBatched(hasDomPropsBinding),
    hasSourceText: hasScalar(hasSourceTextBinding),
    hasElementText: has(hasElementTextBinding),
    hasRangeText: has(hasRangeTextBinding),
    hasTextExpression: hasScalar(hasTextExpression),
    hasDynamicAttr: hasScalar(hasDynamicAttrBinding),
    hasAttrExpression: hasScalar(hasAttrExpressionBinding),
    hasDomProps: hasScalar(hasDomPropsBinding),
    hasBranch: has(hasBranch),
    hasForBlock: has(hasForBlock),
    hasComponent: has(hasComponent),
    hasComponentPropsSpread: has(hasComponentPropsSpread),
  };
}

const EMPTY_SSR_IMPORT_USAGE = createSsrImportUsage([]);

function createModulePrelude(
  ctx: CompilerContext,
  components: readonly ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>
): string {
  const moduleImportNames = collectModuleImportNames(qrlSegments);
  if (moduleImportNames.length === 0 || ctx.program === null) {
    return '';
  }

  const declarations = collectPreservedModuleDeclarations(ctx, components);
  if (declarations.length === 0) {
    return '';
  }

  return `${declarations.join('\n')}\nexport { ${moduleImportNames.join(', ')} };\n\n`;
}

function collectModuleImportNames(qrlSegments: Map<string, QrlSegmentOutput>): string[] {
  const names = new Set<string>();
  for (const qrlSegment of qrlSegments.values()) {
    for (const moduleImport of qrlSegment.segment.moduleImports) {
      names.add(moduleImport.name);
    }
  }
  return [...names];
}

function collectPreservedModuleDeclarations(
  ctx: CompilerContext,
  components: readonly ComponentRecord[]
): string[] {
  const componentRanges = components
    .map((component) => component.functionRange)
    .filter((range): range is [number, number] => range !== null);
  const declarations: string[] = [];

  for (const statement of ctx.program?.body ?? []) {
    if (!isPreservedModuleDeclaration(statement)) {
      continue;
    }
    const range = getRange(statement);
    if (
      range === null ||
      componentRanges.some((componentRange) => rangesOverlap(range, componentRange))
    ) {
      continue;
    }
    declarations.push(ctx.input.code.slice(range[0], range[1]));
  }

  return declarations;
}

function isPreservedModuleDeclaration(statement: unknown): boolean {
  if (!statement || typeof statement !== 'object' || !('type' in statement)) {
    return false;
  }
  const type = (statement as { type: string }).type;
  if (
    type === 'VariableDeclaration' ||
    type === 'FunctionDeclaration' ||
    type === 'ClassDeclaration' ||
    type === 'TSInterfaceDeclaration' ||
    type === 'TSTypeAliasDeclaration' ||
    type === 'TSEnumDeclaration'
  ) {
    return true;
  }
  if (type !== 'ExportNamedDeclaration') {
    return false;
  }
  const declaration = (statement as { declaration?: unknown }).declaration;
  return isPreservedModuleDeclaration(declaration);
}

function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

async function createComponentModule(ctx: CompilerContext, component: ComponentRecord) {
  const qrlSegments = collectQrlSegments(ctx, [component], ctx.emitTarget, false);
  const imports = createComponentModuleImports(ctx, component, qrlSegments);
  const source =
    ctx.emitTarget === 'ssr'
      ? emitSsrModule(
          [component],
          qrlSegments,
          ctx.manifest.segments,
          ctx.input.code,
          imports,
          createModulePrelude(ctx, [component], qrlSegments)
        )
      : emitCsrModule(
          [component],
          qrlSegments,
          ctx.manifest.segments,
          ctx.input.code,
          imports,
          createModulePrelude(ctx, [component], qrlSegments)
        );
  const modulePath = createComponentModulePath(ctx, component);
  const transformed = await transform(modulePath, source, {
    lang: getLang(ctx.input.path),
    sourceType: 'module',
    cwd: ctx.options.rootDir,
    sourcemap: false,
  });

  return createModule(modulePath, transformed.code, null, {
    isEntry: true,
    origPath: ctx.input.path,
    segment: createComponentAnalysis(ctx, component),
  });
}

function createComponentModuleImports(
  ctx: CompilerContext,
  component: ComponentRecord,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  return createModuleImports(ctx, [component], qrlSegments);
}

function collectQrlSegments(
  ctx: CompilerContext,
  components: ComponentRecord[],
  emitTarget: CompilerContext['emitTarget'],
  includeBranchChildren = true
): Map<string, QrlSegmentOutput> {
  const segmentById = new Map(ctx.manifest.segments.map((segment) => [segment.id, segment]));
  const qrlSegments = new Map<string, QrlSegmentOutput>();
  for (const component of components) {
    if (component.root) {
      collectNodeQrlSegments(
        ctx,
        component.root,
        segmentById,
        qrlSegments,
        true,
        includeBranchChildren
      );
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
      if (prop.kind === 'named' && prop.qrlSegmentId) {
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
    for (const prop of node.props) {
      if (prop.kind === 'named' && prop.qrlSegmentId) {
        collectExistingQrlSegment(prop.qrlSegmentId, qrlSegments, rootSegments);
      }
    }
    for (const child of node.children) {
      collectCsrRootNodeQrlSegments(child, qrlSegments, rootSegments);
    }
    return;
  }
  if (node.kind === 'branch') {
    collectExistingQrlSegment(node.conditionSegmentId, qrlSegments, rootSegments);
    collectExistingQrlSegment(node.thenSegmentId, qrlSegments, rootSegments);
    if (node.elseSegmentId) {
      collectExistingQrlSegment(node.elseSegmentId, qrlSegments, rootSegments);
    }
  }
  if (node.kind === 'for') {
    collectExistingQrlSegment(node.keySegmentId, qrlSegments, rootSegments);
    collectExistingQrlSegment(node.renderSegmentId, qrlSegments, rootSegments);
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

function collectCsrRootImportUsage(
  components: readonly ComponentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const items = components.map((component) => ({
    root: component.root,
    providesContext: component.providesContext,
    domEffectCount: countScalarDomEffects(component.root),
  }));
  const has = (predicate: (node: RenderNode | null) => boolean) =>
    items.some((item) => predicate(item.root));
  const hasBatched = (predicate: (node: RenderNode | null) => boolean) =>
    items.some((item) => item.domEffectCount > 1 && predicate(item.root));
  const hasScalar = (predicate: (node: RenderNode | null) => boolean) =>
    items.some((item) => item.domEffectCount <= 1 && predicate(item.root));

  return {
    hasDynamicBinding: items.some(
      (item) => hasCsrRootDynamicBinding(item.root) || item.providesContext
    ),
    hasTemplate: has(canEmitTemplateRoot),
    hasDomBatch: items.some((item) => item.domEffectCount > 1),
    hasDomBatchSourceText: hasBatched(hasCsrRootSourceTextBinding),
    hasDomBatchTextExpression: hasBatched(hasCsrRootTextExpression),
    hasDomBatchDynamicAttr: hasBatched(hasCsrRootDynamicAttrBinding),
    hasDomBatchAttrExpression: hasBatched(hasCsrRootAttrExpression),
    hasDomBatchProps: hasBatched(hasCsrRootDomPropsBinding),
    hasSourceText: hasScalar(hasCsrRootSourceTextBinding),
    hasTextExpression: hasScalar(hasCsrRootTextExpression),
    hasDynamicAttr: hasScalar(hasCsrRootDynamicAttrBinding),
    hasAttrExpression: hasScalar(hasCsrRootAttrExpression),
    hasDomProps: hasScalar(hasCsrRootDomPropsBinding),
    hasDirectEvent: has(hasCsrRootDirectDomEvent),
    hasCapturedDomPropsEvent: has((root) => hasCapturedDomPropsEvent(root, qrlSegments)),
    hasCapturedFunction: has((root) => hasCapturedCsrFunction(root, qrlSegments)),
    hasBranch: has(hasCsrRootBranch),
    hasForBlock: has(hasCsrRootForBlock),
    hasComponent: has(hasCsrRootComponent),
    hasComponentPropsSpread: has(hasCsrRootComponentPropsSpread),
  };
}

function hasCsrRootDynamicBinding(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) =>
      current.kind === 'dynamicText' ||
      current.kind === 'branch' ||
      current.kind === 'for' ||
      (current.kind === 'component' &&
        current.props.some(
          (prop) =>
            prop.kind === 'spread' ||
            prop.expressionRange !== undefined ||
            prop.qrlSegmentId !== undefined
        )) ||
      (current.kind === 'element' &&
        current.props.some(
          (prop) =>
            prop.kind === 'spread' ||
            (prop.kind === 'named' && (prop.binding || prop.expressionRange !== undefined))
        ))
  );
}

function hasCsrRootSourceTextBinding(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) => current.kind === 'dynamicText' && current.binding.kind === 'source'
  );
}

function hasCsrRootTextExpression(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) => current.kind === 'dynamicText' && current.binding.kind === 'expression'
  );
}

function hasCsrRootDynamicAttrBinding(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) =>
      current.kind === 'element' &&
      current.props.some((prop) => prop.kind === 'named' && prop.binding?.kind === 'source')
  );
}

function hasCsrRootAttrExpression(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) =>
      current.kind === 'element' &&
      current.props.some((prop) => prop.kind === 'named' && prop.binding?.kind === 'expression')
  );
}

function hasCsrRootDomPropsBinding(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) => current.kind === 'element' && current.props.some((prop) => prop.kind === 'spread')
  );
}

function hasCsrRootDirectDomEvent(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) =>
      current.kind === 'element' &&
      !current.props.some((prop) => prop.kind === 'spread') &&
      current.props.some((prop) => prop.kind === 'named' && prop.qrlSegmentId)
  );
}

function hasCsrRootComponentPropsSpread(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) =>
      current.kind === 'component' && current.props.some((prop) => prop.kind === 'spread')
  );
}

function hasCsrRootBranch(node: RenderNode | null): boolean {
  return someCsrRootNode(node, (current) => current.kind === 'branch');
}

function hasCsrRootForBlock(node: RenderNode | null): boolean {
  return someCsrRootNode(node, (current) => current.kind === 'for');
}

function hasCsrRootComponent(node: RenderNode | null): boolean {
  return someCsrRootNode(node, (current) => current.kind === 'component');
}

function someCsrRootNode(
  node: RenderNode | null,
  predicate: (node: RenderNode) => boolean
): boolean {
  if (!node) {
    return false;
  }
  if (predicate(node)) {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    return node.children.some((child) => someCsrRootNode(child, predicate));
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
  includeTextExpressions: boolean,
  includeBranchChildren = true
) {
  if (node.kind === 'element') {
    if (node.propsSegmentId) {
      collectSegmentById(ctx, node.propsSegmentId, segmentById, qrlSegments);
    }
    for (const prop of node.props) {
      if (prop.kind === 'named' && prop.qrlSegmentId) {
        collectSegmentById(ctx, prop.qrlSegmentId, segmentById, qrlSegments);
      }
      if (prop.kind === 'named' && prop.binding?.kind === 'expression') {
        collectSegmentById(ctx, prop.binding.qrlSegmentId, segmentById, qrlSegments);
      }
    }
  }
  if (node.kind === 'component') {
    for (const prop of node.props) {
      if (prop.kind === 'named' && prop.qrlSegmentId) {
        collectSegmentById(ctx, prop.qrlSegmentId, segmentById, qrlSegments);
      }
    }
  }
  if (node.kind === 'branch') {
    collectSegmentById(ctx, node.conditionSegmentId, segmentById, qrlSegments);
    collectSegmentById(ctx, node.thenSegmentId, segmentById, qrlSegments);
    if (node.elseSegmentId) {
      collectSegmentById(ctx, node.elseSegmentId, segmentById, qrlSegments);
    }
    if (includeBranchChildren) {
      for (const child of node.thenChildren) {
        collectNodeQrlSegments(
          ctx,
          child,
          segmentById,
          qrlSegments,
          includeTextExpressions,
          includeBranchChildren
        );
      }
      for (const child of node.elseChildren) {
        collectNodeQrlSegments(
          ctx,
          child,
          segmentById,
          qrlSegments,
          includeTextExpressions,
          includeBranchChildren
        );
      }
    }
  }
  if (node.kind === 'for') {
    collectSegmentById(ctx, node.keySegmentId, segmentById, qrlSegments);
    collectSegmentById(ctx, node.renderSegmentId, segmentById, qrlSegments);
    if (includeBranchChildren) {
      for (const child of node.children) {
        collectNodeQrlSegments(
          ctx,
          child,
          segmentById,
          qrlSegments,
          includeTextExpressions,
          includeBranchChildren
        );
      }
    }
  }
  if (includeTextExpressions && node.kind === 'dynamicText' && node.binding.kind === 'expression') {
    collectSegmentById(ctx, node.binding.qrlSegmentId, segmentById, qrlSegments);
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    for (const child of node.children) {
      collectNodeQrlSegments(
        ctx,
        child,
        segmentById,
        qrlSegments,
        includeTextExpressions,
        includeBranchChildren
      );
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
  return createModuleImportPath(ctx, modulePath);
}

function createComponentModulePath(ctx: CompilerContext, component: ComponentRecord) {
  return `${ctx.input.path}_${createComponentSymbol(ctx, component)}.js`;
}

function createComponentImportPath(ctx: CompilerContext, component: ComponentRecord) {
  return createModuleImportPath(ctx, createComponentModulePath(ctx, component));
}

function createModuleImportPath(ctx: CompilerContext, modulePath: string) {
  return `./${basename(modulePath).slice(0, -3)}${ctx.options.explicitExtensions ? '.js' : ''}`;
}

function createInputModuleImportPath(ctx: CompilerContext) {
  const baseName = basename(ctx.input.path).replace(/\.[cm]?[jt]sx?$/, '');
  return `./${baseName}${ctx.options.explicitExtensions ? '.js' : ''}`;
}

function createSegmentModuleImports(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput
): ImportRecord[] {
  const names = qrlSegment.segment.moduleImports.map((moduleImport) => moduleImport.name);
  return names.length > 0 ? [createNamedImport(createInputModuleImportPath(ctx), names)] : [];
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
  if (qrlSegment.segment.kind === 'jsxSpreadProps') {
    return createSsrPropsSegmentSource(ctx, qrlSegment, qrlSegments);
  }

  if (ctx.emitTarget === 'ssr' && isSsrDomExpressionSegment(qrlSegment.segment)) {
    return createSsrDomExpressionSegmentSource(ctx, qrlSegment, qrlSegments);
  }

  if (qrlSegment.segment.kind === 'branchRender') {
    if (ctx.emitTarget === 'ssr') {
      return createSsrBranchRenderSegmentSource(ctx, qrlSegment, qrlSegments);
    }
    return createBranchRenderSegmentSource(ctx, qrlSegment, qrlSegments);
  }

  if (qrlSegment.segment.kind === 'forRender') {
    if (ctx.emitTarget === 'ssr') {
      return createSsrForRenderSegmentSource(ctx, qrlSegment, qrlSegments);
    }
    return createForRenderSegmentSource(ctx, qrlSegment, qrlSegments);
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
  let bodyStatements =
    qrlSegment.segment.bodyKind === 'block' ? body.slice(1, -1).trim() : `return ${body};`;
  bodyStatements = rewriteLoopCaptures(bodyStatements, captures);
  const sparkImports: QwikSymbol[] = [];
  if (captures.length > 0) {
    sparkImports.push(QwikSymbol.Captures);
  }
  if (usesIdentifier(bodyStatements, QwikSymbol.CreateContext)) {
    sparkImports.push(QwikSymbol.CreateContext);
  }
  const importRecords = createSegmentModuleImports(ctx, qrlSegment);
  const importLine =
    importRecords.length > 0 || sparkImports.length > 0
      ? `${emitImports([
          ...importRecords,
          ...(sparkImports.length > 0 ? [createQwikSparkImport(...sparkImports)] : []),
        ]).join('\n')}\n\n`
      : '';

  return `${importLine}export const ${qrlSegment.symbolName} = ${
    qrlSegment.segment.async ? 'async ' : ''
  }(${params}) => {
${captureLine}${indentBody(bodyStatements)}
};
`;
}

function isSsrDomExpressionSegment(segment: SegmentRecord): boolean {
  return (
    segment.kind === 'jsxText' || (segment.kind === 'jsxProp' && segment.functionRange === null)
  );
}

function createSsrDomExpressionSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const captures = qrlSegment.segment.captures;
  const params = captures.map((capture) => capture.name).join(', ');
  const body = qrlSegment.segment.bodyRange
    ? transformImplicitDollarCode(
        ctx.input.code,
        qrlSegment.segment.bodyRange,
        ctx.manifest.segments,
        qrlSegments,
        ctx.emitTarget
      )
    : 'undefined';
  const bodyStatements = `return ${rewriteLoopCaptures(body, captures)};`;
  const sparkImports: QwikSymbol[] = [];
  if (usesIdentifier(bodyStatements, QwikSymbol.CreateContext)) {
    sparkImports.push(QwikSymbol.CreateContext);
  }
  const importRecords = createSegmentModuleImports(ctx, qrlSegment);
  const importLine =
    importRecords.length > 0 || sparkImports.length > 0
      ? `${emitImports([
          ...importRecords,
          ...(sparkImports.length > 0 ? [createQwikSparkImport(...sparkImports)] : []),
        ]).join('\n')}\n\n`
      : '';

  return `${importLine}export const ${qrlSegment.symbolName} = (${params}) => {
${indentBody(bodyStatements)}
};
`;
}

function createSsrPropsSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const element = findPropsSegmentElement(ctx, qrlSegment.id);
  if (element === null) {
    throw new Error(`Missing props IR for ${qrlSegment.id}.`);
  }

  const segmentQrlSegments = new Map<string, QrlSegmentOutput>();
  for (const prop of element.props) {
    if (prop.kind === 'named' && prop.qrlSegmentId) {
      collectExistingQrlSegment(prop.qrlSegmentId, qrlSegments, segmentQrlSegments);
    }
  }
  const captures = qrlSegment.segment.captures;
  const objectExpression = emitSsrDomPropsExpression(
    element.props,
    qrlSegments,
    ctx.input.code,
    captures
  );
  const bodyStatements = `return ${objectExpression};`;
  const importRecords = [
    ...createSegmentModuleImports(ctx, qrlSegment),
    ...createSsrResolvedSegmentImports(segmentQrlSegments),
  ];
  const imports =
    segmentQrlSegments.size === 0
      ? importRecords
      : createSsrImports(importRecords, segmentQrlSegments, EMPTY_SSR_IMPORT_USAGE);
  const importLine = imports.length > 0 ? `${emitImports(imports).join('\n')}\n\n` : '';
  const qrlPrelude = emitSsrQrlPrelude(segmentQrlSegments);
  const params = captures.map((capture) => capture.name).join(', ');

  return `${importLine}${qrlPrelude}export const ${qrlSegment.symbolName} = (${params}) => {
${indentBody(bodyStatements)}
};
`;
}

interface BranchRenderUsage {
  sparkImports: Set<QwikSymbol>;
  segmentImports: Map<string, QrlSegmentOutput>;
}

function createSsrBranchRenderSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const children = findBranchRenderChildren(ctx, qrlSegment.id);
  if (children === null) {
    throw new Error(`Missing branch render IR for ${qrlSegment.id}.`);
  }

  const fragment: RenderNode = { kind: 'fragment', children: [...children] };
  const segmentQrlSegments = collectRenderNodeQrlSegments(ctx, fragment, qrlSegments);
  const hasBranchRootRangeText = hasRootRangeTextBinding(fragment);
  const captures = qrlSegment.segment.captures;
  const emitter = new SsrEmitter(segmentQrlSegments, ctx.input.code, {
    domEffectCount: countScalarDomEffects(fragment),
    rootRangeTarget: hasBranchRootRangeText ? 'rangeId' : undefined,
  });
  const html = emitter.emitHtmlExpression(fragment);
  const isAsync = hasBranch(fragment) || hasComponent(fragment);
  const captureLine =
    captures.length > 0
      ? `const ${captures
          .map((capture, index) => `${capture.name} = ${QwikSymbol.Captures}[${index}]`)
          .join(', ')};`
      : '';
  const bodyStatements = [captureLine, emitter.toString(), `return ${html};`]
    .filter(Boolean)
    .join('\n');
  const importRecords = [
    ...createSegmentModuleImports(ctx, qrlSegment),
    ...createComponentReferenceImports(ctx, fragment),
    ...createSsrResolvedSegmentImports(segmentQrlSegments),
  ];
  if (captures.length > 0) {
    importRecords.push(createQwikSparkImport(QwikSymbol.Captures));
  }
  const imports = createSsrImports(
    importRecords,
    segmentQrlSegments,
    createSsrImportUsage([{ root: fragment }])
  );
  const importLine = imports.length > 0 ? `${emitImports(imports).join('\n')}\n\n` : '';
  const qrlPrelude = emitSsrQrlPrelude(segmentQrlSegments);

  const params = hasBranchRootRangeText ? 'ctx, rangeId' : 'ctx';
  return `${importLine}${qrlPrelude}export const ${qrlSegment.symbolName} = ${
    isAsync ? 'async ' : ''
  }(${params}) => {
${indentBody(bodyStatements)}
};
`;
}

function hasRootRangeTextBinding(node: RenderNode): boolean {
  if (node.kind === 'dynamicText') {
    return true;
  }
  if (node.kind === 'fragment') {
    return node.children.some(hasRootRangeTextBinding);
  }
  return false;
}

function createSsrResolvedSegmentImports(
  qrlSegments: Map<string, QrlSegmentOutput>
): ImportRecord[] {
  const imports: ImportRecord[] = [];
  for (const qrlSegment of qrlSegments.values()) {
    if (shouldResolveSsrQrl(qrlSegment)) {
      imports.push(createNamedImport(qrlSegment.importPath, [qrlSegment.symbolName]));
    }
  }
  return imports;
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
  const segmentQrlSegments = collectRenderNodeQrlSegments(ctx, {
    kind: 'fragment',
    children: [...children],
  });
  const fragment: RenderNode = { kind: 'fragment', children: [...children] };
  const captures = qrlSegment.segment.captures;
  const emitter = new DomEmitter(segmentQrlSegments, ctx.input.code, {
    branchCondition: 'inline',
    domEffectCount: countScalarDomEffects(fragment),
    helperPrefix: qrlSegment.symbolName,
    importSegment: (segment) => usage.segmentImports.set(segment.id, segment),
    use: (symbol) => usage.sparkImports.add(symbol),
  });
  const roots =
    emitter.emitTemplateRoots(children) ?? children.flatMap((child) => emitter.emitRoot(child));
  emitter.finalizeDomBatchEffects();
  const captureLine =
    captures.length > 0
      ? `const ${captures
          .map((capture, index) => `${capture.name} = ${QwikSymbol.Captures}[${index}]`)
          .join(', ')};`
      : '';
  const bodyStatements = [
    captureLine,
    emitter.toString(),
    `return ${emitNodeOutputExpression(roots)};`,
  ]
    .filter(Boolean)
    .join('\n');
  const imports = [
    ...createSegmentModuleImports(ctx, qrlSegment),
    ...createDomEmitterModuleImports(ctx, emitter),
    ...createComponentReferenceImports(ctx, {
      kind: 'fragment',
      children: [...children],
    }),
  ];

  if (captures.length > 0) {
    usage.sparkImports.add(QwikSymbol.Captures);
  }
  if (usage.sparkImports.size > 0) {
    imports.push(createQwikSparkImport(...usage.sparkImports));
  }
  for (const segment of usage.segmentImports.values()) {
    imports.push(createNamedImport(segment.importPath, [segment.symbolName]));
  }

  const importLine =
    imports.length > 0 ? `${emitImports(normalizeImports(imports)).join('\n')}\n\n` : '';
  return `${importLine}${emitter.emitHoists()}export const ${qrlSegment.symbolName} = (ctx) => {
${indentBody(bodyStatements)}
};
`;
}

function createSsrForRenderSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const children = findForRenderChildren(ctx, qrlSegment.id);
  if (children === null) {
    throw new Error(`Missing for render IR for ${qrlSegment.id}.`);
  }

  const fragment: RenderNode = { kind: 'fragment', children: [...children] };
  const segmentQrlSegments = collectRenderNodeQrlSegments(ctx, fragment, qrlSegments);
  const hasForRootRangeText = hasRootRangeTextBinding(fragment);
  const captures = qrlSegment.segment.captures;
  const rowIsElement = children.length === 1 && children[0].kind === 'element';
  const emitter = new SsrEmitter(segmentQrlSegments, ctx.input.code, {
    domEffectCount: countScalarDomEffects(fragment),
    rootRangeTarget: hasForRootRangeText ? 'rowId' : undefined,
    rootElementAttr: rowIsElement ? 'q:row' : undefined,
    loopCaptures: createLoopParamCaptures(qrlSegment.segment),
  });
  const html = emitter.emitHtmlExpression(fragment);
  const rowHtml = rowIsElement ? html : `'<!r=' + rowId + '>' + ${html} + '<!/r>'`;
  const isAsync = hasBranch(fragment) || hasForBlock(fragment) || hasComponent(fragment);
  const captureLine =
    captures.length > 0
      ? `const ${captures
          .map((capture, index) => `${capture.name} = ${QwikSymbol.Captures}[${index}]`)
          .join(', ')};`
      : '';
  const bodyStatements = [captureLine, emitter.toString(), `return ${rowHtml};`]
    .filter(Boolean)
    .join('\n');
  const importRecords = [
    ...createSegmentModuleImports(ctx, qrlSegment),
    ...createComponentReferenceImports(ctx, fragment),
    ...createSsrResolvedSegmentImports(segmentQrlSegments),
  ];
  if (captures.length > 0) {
    importRecords.push(createQwikSparkImport(QwikSymbol.Captures));
  }
  const imports = createSsrImports(
    importRecords,
    segmentQrlSegments,
    createSsrImportUsage([{ root: fragment }])
  );
  const importLine = imports.length > 0 ? `${emitImports(imports).join('\n')}\n\n` : '';
  const qrlPrelude = emitSsrQrlPrelude(segmentQrlSegments);
  const { itemName, indexName } = getForRenderParamNames(qrlSegment.segment);

  return `${importLine}${qrlPrelude}export const ${qrlSegment.symbolName} = ${
    isAsync ? 'async ' : ''
  }(ctx, rangeId, rowId, ${itemName}, ${indexName}) => {
${indentBody(bodyStatements)}
};
`;
}

function createForRenderSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const children = findForRenderChildren(ctx, qrlSegment.id);
  if (children === null) {
    throw new Error(`Missing for render IR for ${qrlSegment.id}.`);
  }

  const usage: BranchRenderUsage = {
    sparkImports: new Set(),
    segmentImports: new Map(),
  };
  const segmentQrlSegments = collectRenderNodeQrlSegments(ctx, {
    kind: 'fragment',
    children: [...children],
  });
  const fragment: RenderNode = { kind: 'fragment', children: [...children] };
  const captures = qrlSegment.segment.captures;
  const emitter = new DomEmitter(segmentQrlSegments, ctx.input.code, {
    branchCondition: 'inline',
    domEffectMode: 'run',
    domEffectCount: countScalarDomEffects(fragment),
    helperPrefix: qrlSegment.symbolName,
    loopCaptures: createLoopParamCaptures(qrlSegment.segment),
    importSegment: (segment) => usage.segmentImports.set(segment.id, segment),
    use: (symbol) => usage.sparkImports.add(symbol),
  });
  const roots =
    emitter.emitTemplateRoots(children) ?? children.flatMap((child) => emitter.emitRoot(child));
  emitter.finalizeDomBatchEffects();
  const captureLine =
    captures.length > 0
      ? `const ${captures
          .map((capture, index) => `${capture.name} = ${QwikSymbol.Captures}[${index}]`)
          .join(', ')};`
      : '';
  const bodyStatements = [
    captureLine,
    emitter.toString(),
    `return ${emitNodeOutputExpression(roots)};`,
  ]
    .filter(Boolean)
    .join('\n');
  const imports = [
    ...createSegmentModuleImports(ctx, qrlSegment),
    ...createDomEmitterModuleImports(ctx, emitter),
    ...createComponentReferenceImports(ctx, {
      kind: 'fragment',
      children: [...children],
    }),
  ];

  if (captures.length > 0) {
    usage.sparkImports.add(QwikSymbol.Captures);
  }
  if (usage.sparkImports.size > 0) {
    imports.push(createQwikSparkImport(...usage.sparkImports));
  }
  for (const segment of usage.segmentImports.values()) {
    imports.push(createNamedImport(segment.importPath, [segment.symbolName]));
  }

  const importLine =
    imports.length > 0 ? `${emitImports(normalizeImports(imports)).join('\n')}\n\n` : '';
  const { itemName, indexName } = getForRenderParamNames(qrlSegment.segment);
  return `${importLine}${emitter.emitHoists()}export const ${qrlSegment.symbolName} = (ctx, ${itemName}, ${indexName}) => {
${indentBody(bodyStatements)}
};
`;
}

function createDomEmitterModuleImports(ctx: CompilerContext, emitter: DomEmitter): ImportRecord[] {
  const names = emitter.getModuleImportNames();
  return names.length > 0 ? [createNamedImport(createInputModuleImportPath(ctx), names)] : [];
}

function getForRenderParamNames(segment: SegmentRecord): { itemName: string; indexName: string } {
  return {
    itemName: segment.params[0]?.name ?? 'item',
    indexName: segment.params[1]?.name ?? 'index',
  };
}

function collectRenderNodeQrlSegments(
  ctx: CompilerContext,
  node: RenderNode,
  existingSegments?: Map<string, QrlSegmentOutput>
): Map<string, QrlSegmentOutput> {
  const segmentById = new Map(ctx.manifest.segments.map((segment) => [segment.id, segment]));
  const qrlSegments = new Map<string, QrlSegmentOutput>();
  collectNodeQrlSegments(ctx, node, segmentById, qrlSegments, true, false);
  if (!existingSegments) {
    return qrlSegments;
  }
  return new Map(
    Array.from(qrlSegments.keys()).flatMap((id) => {
      const qrlSegment = existingSegments.get(id);
      return qrlSegment ? [[id, qrlSegment] as const] : [];
    })
  );
}

function createLoopParamCaptures(segment: SegmentRecord): Array<{ name: string; source: string }> {
  const captures: Array<{ name: string; source: string }> = [];
  for (let i = 0; i < segment.params.length && i < 2; i++) {
    const name = segment.params[i].name;
    if (name !== null) {
      captures.push({ name, source: 'loop' });
    }
  }
  return captures;
}

function createComponentReferenceImports(
  ctx: CompilerContext,
  node: RenderNode,
  currentComponent?: ComponentRecord
): ImportRecord[] {
  const names = collectComponentReferenceNames(node);
  if (names.size === 0) {
    return [];
  }

  const imports: ImportRecord[] = [];
  const sameModuleNames = new Set<string>();
  for (const name of names) {
    const component = findNamedComponent(ctx, name);
    if (!component || component.exported || component === currentComponent) {
      continue;
    }
    sameModuleNames.add(name);
    imports.push(createNamedImport(createComponentImportPath(ctx, component), [name]));
  }

  const externalNames = new Set(Array.from(names).filter((name) => !sameModuleNames.has(name)));
  for (const importRecord of ctx.manifest.imports) {
    if (importRecord.typeOnly) {
      continue;
    }
    const specifiers = importRecord.specifiers.filter((specifier) => {
      if (specifier.kind === 'named' && specifier.typeOnly) {
        return false;
      }
      if (!externalNames.has(specifier.localName)) {
        return false;
      }
      return true;
    });
    if (specifiers.length > 0) {
      imports.push({
        source: importRecord.source,
        typeOnly: false,
        specifiers,
      });
    }
  }
  return imports;
}

function collectComponentReferenceNames(node: RenderNode): Set<string> {
  const names = new Set<string>();
  collectComponentReferenceNamesInNode(node, names);
  return names;
}

function collectComponentReferenceNamesInNode(node: RenderNode, names: Set<string>) {
  if (node.kind === 'component') {
    names.add(node.name);
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    for (const child of node.children) {
      collectComponentReferenceNamesInNode(child, names);
    }
  }
  if (node.kind === 'for') {
    for (const child of node.children) {
      collectComponentReferenceNamesInNode(child, names);
    }
  }
}

function findNamedComponent(ctx: CompilerContext, name: string) {
  return ctx.manifest.components.find(
    (component) => component.exportName === name || component.localName === name
  );
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

function findPropsSegmentElement(ctx: CompilerContext, segmentId: string): ElementNode | null {
  for (const component of ctx.manifest.components) {
    if (component.root === null) {
      continue;
    }
    const element = findPropsSegmentElementInNode(component.root, segmentId);
    if (element !== null) {
      return element;
    }
  }
  return null;
}

function findPropsSegmentElementInNode(node: RenderNode, segmentId: string): ElementNode | null {
  if (node.kind === 'element') {
    if (node.propsSegmentId === segmentId) {
      return node;
    }
    for (const child of node.children) {
      const element = findPropsSegmentElementInNode(child, segmentId);
      if (element !== null) {
        return element;
      }
    }
    return null;
  }
  if (node.kind === 'fragment' || node.kind === 'component') {
    for (const child of node.children) {
      const element = findPropsSegmentElementInNode(child, segmentId);
      if (element !== null) {
        return element;
      }
    }
    return null;
  }
  if (node.kind === 'branch') {
    for (const child of node.thenChildren) {
      const element = findPropsSegmentElementInNode(child, segmentId);
      if (element !== null) {
        return element;
      }
    }
    for (const child of node.elseChildren) {
      const element = findPropsSegmentElementInNode(child, segmentId);
      if (element !== null) {
        return element;
      }
    }
  }
  if (node.kind === 'for') {
    for (const child of node.children) {
      const element = findPropsSegmentElementInNode(child, segmentId);
      if (element !== null) {
        return element;
      }
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
  if (node.kind === 'for') {
    for (const child of node.children) {
      const children = findBranchRenderChildrenInNode(child, segmentId);
      if (children !== null) {
        return children;
      }
    }
  }
  return null;
}

function findForRenderChildren(
  ctx: CompilerContext,
  segmentId: string
): readonly RenderNode[] | null {
  for (const component of ctx.manifest.components) {
    if (component.root === null) {
      continue;
    }
    const children = findForRenderChildrenInNode(component.root, segmentId);
    if (children !== null) {
      return children;
    }
  }
  return null;
}

function findForRenderChildrenInNode(
  node: RenderNode,
  segmentId: string
): readonly RenderNode[] | null {
  if (node.kind === 'for') {
    if (node.renderSegmentId === segmentId) {
      return node.children;
    }
    for (const child of node.children) {
      const children = findForRenderChildrenInNode(child, segmentId);
      if (children !== null) {
        return children;
      }
    }
  }
  if (node.kind === 'branch') {
    for (const child of node.thenChildren) {
      const children = findForRenderChildrenInNode(child, segmentId);
      if (children !== null) {
        return children;
      }
    }
    for (const child of node.elseChildren) {
      const children = findForRenderChildrenInNode(child, segmentId);
      if (children !== null) {
        return children;
      }
    }
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'component') {
    for (const child of node.children) {
      const children = findForRenderChildrenInNode(child, segmentId);
      if (children !== null) {
        return children;
      }
    }
  }
  return null;
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

function createComponentAnalysis(
  ctx: CompilerContext,
  component: ComponentRecord
): SegmentAnalysis {
  const inputName = basename(ctx.input.path);
  const name = createComponentSymbol(ctx, component);
  return {
    origin: inputName,
    name,
    entry: null,
    displayName: name,
    hash: name,
    canonicalFilename: `${inputName}_${name}`,
    extension: 'js',
    parent: null,
    ctxKind: 'function',
    ctxName: 'component',
    captures: false,
    loc: component.functionRange ?? [0, 0],
    paramNames: component.params.map((param) => param.name ?? '_'),
  };
}

function createQrlSegmentAnalysis(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput
): SegmentAnalysis {
  const segment = qrlSegment.segment;
  const loc = segment.range ?? segment.functionRange ?? [0, 0];
  const inputName = basename(ctx.input.path);
  return {
    origin: inputName,
    name: qrlSegment.symbolName,
    entry: null,
    displayName: qrlSegment.symbolName,
    hash: segment.id,
    canonicalFilename: `${inputName}_${qrlSegment.symbolName}`,
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

function createComponentSymbol(ctx: CompilerContext, component: ComponentRecord) {
  const sourceName = basename(ctx.input.path).replace(/\.[cm]?[jt]sx?$/, '');
  const componentName =
    component.exportName === 'default' ? (component.localName ?? 'default') : component.exportName;
  return sanitizeIdentifier(`${sourceName}_${componentName}`);
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
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return slash === -1 ? path : path.slice(slash + 1);
}
