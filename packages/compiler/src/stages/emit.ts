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
  emitImports,
  emitSsrQrlPrelude,
  hasCapturedCsrFunction,
  hasCapturedDomPropsEvent,
  hasComponentPropsSpread,
  hasDynamicBinding,
  hasElementTextBinding,
  hasBranch,
  hasForBlock,
  hasComponent,
  hasComponentSlots,
  hasSlot,
  hasRangeTextBinding,
  getDomEffectBatchStats,
  isDomEffectBatched,
  type ScalarDomEffectKind,
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
  const referencedComponents = collectReferencedComponents(ctx, supported);
  const moduleComponents = supported.filter(
    (component) => !component.exported || referencedComponents.has(component)
  );
  const mainComponents = supported.filter(
    (component) => component.exported && !referencedComponents.has(component)
  );
  const mainQrlSegments = collectQrlSegments(ctx, mainComponents, ctx.emitTarget, false);
  const mainPrelude = createModulePrelude(ctx, qrlSegments);
  const exports = createComponentReExports(
    ctx,
    moduleComponents.filter((component) => component.exported)
  );
  const imports = createModuleImports(ctx, mainComponents, mainQrlSegments);
  const outputCode =
    ctx.emitTarget === 'ssr'
      ? emitSsrModule(
          mainComponents,
          mainQrlSegments,
          ctx.manifest.segments,
          ctx.input.code,
          imports,
          `${mainPrelude}${exports}`
        )
      : emitCsrModule(
          mainComponents,
          mainQrlSegments,
          ctx.manifest.segments,
          ctx.input.code,
          imports,
          `${mainPrelude}${exports}`
        );
  const modules = [createModule(ctx.input.path, outputCode)];

  for (const component of moduleComponents) {
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
        })),
        qrlSegments
      )
    );
  }

  return createCsrImports(
    baseImports,
    collectCsrRootQrlSegments(components, qrlSegments),
    collectCsrRootImportUsage(components, qrlSegments)
  );
}

function collectReferencedComponents(
  ctx: CompilerContext,
  components: readonly ComponentRecord[]
): Set<ComponentRecord> {
  const referenced = new Set<ComponentRecord>();
  for (const component of components) {
    if (component.root === null) {
      continue;
    }
    for (const name of collectComponentReferenceNames(component.root, true)) {
      const child = findNamedComponent(ctx, name);
      if (child && child !== component) {
        referenced.add(child);
      }
    }
  }
  return referenced;
}

interface SsrUsageRoot {
  root: RenderNode | null;
  providesContext?: boolean;
}

function createSsrImportUsage(
  roots: readonly SsrUsageRoot[],
  qrlSegments: Map<string, QrlSegmentOutput> = new Map()
): SsrImportUsage {
  const items = roots.map((item) => ({
    ...item,
    batchStats: getDomEffectBatchStats(item.root, qrlSegments),
  }));
  const has = (predicate: (node: RenderNode | null) => boolean) =>
    items.some((item) => predicate(item.root));
  const hasBatched = (kind: ScalarDomEffectKind) =>
    items.some((item) =>
      item.batchStats.effects.some(
        (effect) =>
          effect.kind === kind && isDomEffectBatched(item.batchStats.counts, effect.batchKey)
      )
    );
  const hasScalar = (kind: ScalarDomEffectKind) =>
    items.some((item) =>
      item.batchStats.effects.some(
        (effect) =>
          effect.kind === kind && !isDomEffectBatched(item.batchStats.counts, effect.batchKey)
      )
    );

  return {
    hasDynamicBinding: items.some(
      (item) => hasDynamicBinding(item.root) || item.providesContext === true
    ),
    hasDomBatch: items.some((item) =>
      item.batchStats.effects.some((effect) =>
        isDomEffectBatched(item.batchStats.counts, effect.batchKey)
      )
    ),
    hasDomBatchSourceText: hasBatched('sourceText'),
    hasDomBatchTextExpression: hasBatched('textExpression'),
    hasDomBatchDynamicAttr: hasBatched('dynamicAttr'),
    hasDomBatchAttrExpression: hasBatched('attrExpression'),
    hasDomBatchProps: hasBatched('props'),
    hasSourceText: hasScalar('sourceText'),
    hasElementText: has(hasElementTextBinding),
    hasRangeText: has(hasRangeTextBinding),
    hasTextExpression: hasScalar('textExpression'),
    hasDynamicAttr: hasScalar('dynamicAttr'),
    hasAttrExpression: hasScalar('attrExpression'),
    hasDomProps: hasScalar('props'),
    hasBranch: has(hasBranch),
    hasForBlock: has(hasForBlock),
    hasSlot: has(hasSlot),
    hasComponent: has(hasComponent),
    hasComponentSlots: has(hasComponentSlots),
    hasComponentPropsSpread: has(hasComponentPropsSpread),
  };
}

const EMPTY_SSR_IMPORT_USAGE = createSsrImportUsage([]);

function createModulePrelude(
  ctx: CompilerContext,
  qrlSegments: Map<string, QrlSegmentOutput>
): string {
  const moduleImportNames = collectModuleImportNames(qrlSegments);
  if (ctx.program === null) {
    return '';
  }

  const declarations = collectPreservedModuleDeclarations(ctx);
  if (declarations.length === 0) {
    return '';
  }

  const exports =
    moduleImportNames.length === 0 ? '' : `export { ${moduleImportNames.join(', ')} };\n`;
  return `${declarations.join('\n')}\n${exports}\n`;
}

function createComponentReExports(
  ctx: CompilerContext,
  components: readonly ComponentRecord[]
): string {
  if (components.length === 0) {
    return '';
  }
  return `${components
    .map((component) => {
      const path = JSON.stringify(createComponentImportPath(ctx, component));
      return component.exportName === 'default'
        ? `export { default } from ${path};`
        : `export { ${component.exportName} } from ${path};`;
    })
    .join('\n')}\n\n`;
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

function collectPreservedModuleDeclarations(ctx: CompilerContext): string[] {
  const componentRanges = ctx.manifest.components
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
          createModulePrelude(ctx, qrlSegments)
        )
      : emitCsrModule(
          [component],
          qrlSegments,
          ctx.manifest.segments,
          ctx.input.code,
          imports,
          createModulePrelude(ctx, qrlSegments)
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
    for (const slot of node.slots) {
      collectExistingQrlSegment(slot.segmentId, qrlSegments, rootSegments);
      for (const child of slot.children) {
        collectCsrRootNodeQrlSegments(child, qrlSegments, rootSegments);
      }
    }
    return;
  }
  if (node.kind === 'slot') {
    if (node.fallbackSegmentId) {
      collectExistingQrlSegment(node.fallbackSegmentId, qrlSegments, rootSegments);
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
    batchStats: getDomEffectBatchStats(component.root, qrlSegments),
  }));
  const has = (predicate: (node: RenderNode | null) => boolean) =>
    items.some((item) => predicate(item.root));
  const hasBatched = (kind: ScalarDomEffectKind) =>
    items.some((item) =>
      item.batchStats.effects.some(
        (effect) =>
          effect.kind === kind && isDomEffectBatched(item.batchStats.counts, effect.batchKey)
      )
    );
  const hasScalar = (kind: ScalarDomEffectKind) =>
    items.some((item) =>
      item.batchStats.effects.some(
        (effect) =>
          effect.kind === kind && !isDomEffectBatched(item.batchStats.counts, effect.batchKey)
      )
    );

  return {
    hasDynamicBinding: items.some(
      (item) => hasCsrRootDynamicBinding(item.root) || item.providesContext
    ),
    hasTemplate: has(canEmitTemplateRoot),
    hasDomBatch: items.some((item) =>
      item.batchStats.effects.some((effect) =>
        isDomEffectBatched(item.batchStats.counts, effect.batchKey)
      )
    ),
    hasDomBatchSourceText: hasBatched('sourceText'),
    hasDomBatchTextExpression: hasBatched('textExpression'),
    hasDomBatchDynamicAttr: hasBatched('dynamicAttr'),
    hasDomBatchAttrExpression: hasBatched('attrExpression'),
    hasDomBatchProps: hasBatched('props'),
    hasSourceText: hasScalar('sourceText'),
    hasTextExpression: hasScalar('textExpression'),
    hasDynamicAttr: hasScalar('dynamicAttr'),
    hasAttrExpression: hasScalar('attrExpression'),
    hasDomProps: hasScalar('props'),
    hasDirectEvent: has(hasCsrRootDirectDomEvent),
    hasCapturedDomPropsEvent: has((root) => hasCapturedDomPropsEvent(root, qrlSegments)),
    hasCapturedFunction: has((root) => hasCapturedCsrFunction(root, qrlSegments)),
    hasBranch: has(hasCsrRootBranch),
    hasForBlock: has(hasCsrRootForBlock),
    hasSlot: has(hasCsrRootSlot),
    hasComponent: has(hasCsrRootComponent),
    hasComponentSlots: has(hasCsrRootComponentSlots),
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

function hasCsrRootDirectDomEvent(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) =>
      current.kind === 'element' &&
      !current.props.some((prop) => prop.kind === 'spread') &&
      current.props.some(
        (prop) => prop.kind === 'named' && (prop.qrlSegmentId || prop.expressionRange !== undefined)
      )
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

function hasCsrRootSlot(node: RenderNode | null): boolean {
  return someCsrRootNode(node, (current) => current.kind === 'slot');
}

function hasCsrRootComponent(node: RenderNode | null): boolean {
  return someCsrRootNode(node, (current) => current.kind === 'component');
}

function hasCsrRootComponentSlots(node: RenderNode | null): boolean {
  return someCsrRootNode(
    node,
    (current) => current.kind === 'component' && current.slots.length > 0
  );
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
  if (node.kind === 'element' || node.kind === 'fragment') {
    return node.children.some((child) => someCsrRootNode(child, predicate));
  }
  if (node.kind === 'component') {
    return node.slots.some((slot) =>
      slot.children.some((child) => someCsrRootNode(child, predicate))
    );
  }
  if (node.kind === 'slot') {
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
    for (const slot of node.slots) {
      collectSegmentById(ctx, slot.segmentId, segmentById, qrlSegments);
      if (includeBranchChildren) {
        for (const child of slot.children) {
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
  }
  if (node.kind === 'slot') {
    if (node.fallbackSegmentId) {
      collectSegmentById(ctx, node.fallbackSegmentId, segmentById, qrlSegments);
    }
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
  if (node.kind === 'element' || node.kind === 'fragment') {
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
    return createBranchRenderSegmentSource(ctx, qrlSegment);
  }

  if (qrlSegment.segment.kind === 'forRender') {
    if (ctx.emitTarget === 'ssr') {
      return createSsrForRenderSegmentSource(ctx, qrlSegment, qrlSegments);
    }
    return createForRenderSegmentSource(ctx, qrlSegment, qrlSegments);
  }

  if (qrlSegment.segment.kind === 'slotRender') {
    if (ctx.emitTarget === 'ssr') {
      return createSsrSlotRenderSegmentSource(ctx, qrlSegment, qrlSegments);
    }
    return createSlotRenderSegmentSource(ctx, qrlSegment);
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
  return createSsrRenderSegmentSource(ctx, qrlSegment, qrlSegments, children, false);
}

function createSsrRenderSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>,
  children: readonly RenderNode[],
  alwaysRangeId: boolean
) {
  const fragment: RenderNode = { kind: 'fragment', children: [...children] };
  const segmentQrlSegments = collectRenderNodeQrlSegments(ctx, fragment, qrlSegments);
  const hasRootRangeText = hasRootRangeTextBinding(fragment);
  const captures = qrlSegment.segment.captures;
  const emitter = new SsrEmitter(segmentQrlSegments, ctx.input.code, {
    domEffectBatchCounts: getDomEffectBatchStats(fragment, segmentQrlSegments).counts,
    rootRangeTarget: hasRootRangeText ? 'rangeId' : undefined,
  });
  const html = emitter.emitHtmlExpression(fragment);
  const isAsync =
    hasBranch(fragment) || hasForBlock(fragment) || hasComponent(fragment) || hasSlot(fragment);
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
    createSsrImportUsage([{ root: fragment }], segmentQrlSegments)
  );
  const importLine = imports.length > 0 ? `${emitImports(imports).join('\n')}\n\n` : '';
  const qrlPrelude = emitSsrQrlPrelude(segmentQrlSegments);

  const params = alwaysRangeId || hasRootRangeText ? 'ctx, rangeId' : 'ctx';
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

function createBranchRenderSegmentSource(ctx: CompilerContext, qrlSegment: QrlSegmentOutput) {
  const children = findBranchRenderChildren(ctx, qrlSegment.id);
  if (children === null) {
    throw new Error(`Missing branch render IR for ${qrlSegment.id}.`);
  }
  return createDomRenderSegmentSource(ctx, qrlSegment, children, 'ctx');
}

function createDomRenderSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  children: readonly RenderNode[],
  params: string
) {
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
    domEffectBatchCounts: getDomEffectBatchStats(fragment, segmentQrlSegments).counts,
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
  return `${importLine}${emitter.emitHoists()}export const ${qrlSegment.symbolName} = (${params}) => {
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
    domEffectBatchCounts: getDomEffectBatchStats(fragment, segmentQrlSegments).counts,
    rootRangeTarget: hasForRootRangeText ? 'rowId' : undefined,
    rootElementAttr: rowIsElement ? 'q:row' : undefined,
    loopCaptures: createLoopParamCaptures(qrlSegment.segment),
  });
  const html = emitter.emitHtmlExpression(fragment);
  const rowHtml = rowIsElement ? html : `'<!r=' + rowId + '>' + ${html} + '<!/r>'`;
  const isAsync =
    hasBranch(fragment) || hasForBlock(fragment) || hasComponent(fragment) || hasSlot(fragment);
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
    createSsrImportUsage([{ root: fragment }], segmentQrlSegments)
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
    domEffectBatchCounts: getDomEffectBatchStats(fragment, segmentQrlSegments).counts,
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

function createSsrSlotRenderSegmentSource(
  ctx: CompilerContext,
  qrlSegment: QrlSegmentOutput,
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  const children = findSlotRenderChildren(ctx, qrlSegment.id);
  if (children === null) {
    throw new Error(`Missing slot render IR for ${qrlSegment.id}.`);
  }
  return createSsrRenderSegmentSource(ctx, qrlSegment, qrlSegments, children, true);
}

function createSlotRenderSegmentSource(ctx: CompilerContext, qrlSegment: QrlSegmentOutput) {
  const children = findSlotRenderChildren(ctx, qrlSegment.id);
  if (children === null) {
    throw new Error(`Missing slot render IR for ${qrlSegment.id}.`);
  }
  return createDomRenderSegmentSource(ctx, qrlSegment, children, 'ctx');
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
    if (
      !component ||
      component === currentComponent ||
      !component.supported ||
      component.root === null
    ) {
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

function collectComponentReferenceNames(node: RenderNode, includeBranches = false): Set<string> {
  const names = new Set<string>();
  collectComponentReferenceNamesInNode(node, names, includeBranches);
  return names;
}

function collectComponentReferenceNamesInNode(
  node: RenderNode,
  names: Set<string>,
  includeBranches: boolean
) {
  if (node.kind === 'component') {
    names.add(node.name);
  }
  if (node.kind === 'element' || node.kind === 'fragment') {
    for (const child of node.children) {
      collectComponentReferenceNamesInNode(child, names, includeBranches);
    }
  }
  if (node.kind === 'component') {
    for (const slot of node.slots) {
      for (const child of slot.children) {
        collectComponentReferenceNamesInNode(child, names, includeBranches);
      }
    }
  }
  if (node.kind === 'slot') {
    for (const child of node.children) {
      collectComponentReferenceNamesInNode(child, names, includeBranches);
    }
  }
  if (node.kind === 'for') {
    for (const child of node.children) {
      collectComponentReferenceNamesInNode(child, names, includeBranches);
    }
  }
  if (includeBranches && node.kind === 'branch') {
    for (const child of node.thenChildren) {
      collectComponentReferenceNamesInNode(child, names, includeBranches);
    }
    for (const child of node.elseChildren) {
      collectComponentReferenceNamesInNode(child, names, includeBranches);
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
  return findRenderNodeValue(node, (current) =>
    current.kind === 'element' && current.propsSegmentId === segmentId ? current : null
  );
}

function findBranchRenderChildrenInNode(
  node: RenderNode,
  segmentId: string
): readonly RenderNode[] | null {
  return findRenderNodeValue(node, (current) => {
    if (current.kind !== 'branch') {
      return null;
    }
    if (current.thenSegmentId === segmentId) {
      return current.thenChildren;
    }
    return current.elseSegmentId === segmentId ? current.elseChildren : null;
  });
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

function findSlotRenderChildren(
  ctx: CompilerContext,
  segmentId: string
): readonly RenderNode[] | null {
  for (const component of ctx.manifest.components) {
    if (component.root === null) {
      continue;
    }
    const children = findSlotRenderChildrenInNode(component.root, segmentId);
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
  return findRenderNodeValue(node, (current) =>
    current.kind === 'for' && current.renderSegmentId === segmentId ? current.children : null
  );
}

function findSlotRenderChildrenInNode(
  node: RenderNode,
  segmentId: string
): readonly RenderNode[] | null {
  return findRenderNodeValue(node, (current) => {
    if (current.kind === 'component') {
      return current.slots.find((slot) => slot.segmentId === segmentId)?.children ?? null;
    }
    return current.kind === 'slot' && current.fallbackSegmentId === segmentId
      ? current.children
      : null;
  });
}

function findRenderNodeValue<T>(node: RenderNode, match: (node: RenderNode) => T | null): T | null {
  const matched = match(node);
  if (matched !== null) {
    return matched;
  }

  if (node.kind === 'element' || node.kind === 'fragment') {
    for (const child of node.children) {
      const childMatch = findRenderNodeValue(child, match);
      if (childMatch !== null) {
        return childMatch;
      }
    }
    return null;
  }

  if (node.kind === 'component') {
    for (const slot of node.slots) {
      for (const child of slot.children) {
        const childMatch = findRenderNodeValue(child, match);
        if (childMatch !== null) {
          return childMatch;
        }
      }
    }
    return null;
  }

  if (node.kind === 'slot' || node.kind === 'for') {
    for (const child of node.children) {
      const childMatch = findRenderNodeValue(child, match);
      if (childMatch !== null) {
        return childMatch;
      }
    }
  }

  if (node.kind === 'branch') {
    for (const child of node.thenChildren) {
      const childMatch = findRenderNodeValue(child, match);
      if (childMatch !== null) {
        return childMatch;
      }
    }
    for (const child of node.elseChildren) {
      const childMatch = findRenderNodeValue(child, match);
      if (childMatch !== null) {
        return childMatch;
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
