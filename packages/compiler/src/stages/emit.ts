import type { SegmentAnalysis } from '@qwik.dev/optimizer';
import { transform } from 'oxc-transform';
import { jsxEventToHtmlAttribute } from '../ast-utils';
import { createCsrImports, createQwikSparkImport, createSsrImports } from '../imports';
import { createModule, getLang } from '../module-utils';
import type { CompilerContext } from '../types';
import type { ComponentRecord, QrlSegmentOutput, RenderNode, SegmentRecord } from '../types';
import { QwikSymbol } from '../words';
import { emitCsrModule } from './emit-csr';
import { emitSsrModule } from './emit-ssr';
import {
  emitImports,
  hasDynamicAttrBinding,
  hasDynamicBinding,
  hasElementTextBinding,
  hasRangeTextBinding,
  hasSourceTextBinding,
  hasTextExpression,
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
  const dynamicUsage = {
    hasDynamicBinding: supported.some((component) => hasDynamicBinding(component.root)),
    hasSourceText: supported.some((component) => hasSourceTextBinding(component.root)),
    hasTextExpression: supported.some((component) => hasTextExpression(component.root)),
    hasDynamicAttr: supported.some((component) => hasDynamicAttrBinding(component.root)),
  };
  const ssrUsage = {
    ...dynamicUsage,
    hasElementText: supported.some((component) => hasElementTextBinding(component.root)),
    hasRangeText: supported.some((component) => hasRangeTextBinding(component.root)),
  };
  const transformedImports = transformDollarImports(ctx.manifest.imports, ctx.emitTarget);
  const imports =
    ctx.emitTarget === 'ssr'
      ? createSsrImports(transformedImports, qrlSegments, ssrUsage)
      : createCsrImports(transformedImports, qrlSegments, dynamicUsage);
  const outputCode =
    ctx.emitTarget === 'ssr'
      ? emitSsrModule(supported, qrlSegments, ctx.manifest.segments, ctx.input.code, imports)
      : emitCsrModule(supported, qrlSegments, ctx.manifest.segments, ctx.input.code, imports);
  const modules = [createModule(ctx.input.path, outputCode)];

  for (const qrlSegment of qrlSegments.values()) {
    modules.push(await createQrlSegmentModule(ctx, qrlSegment));
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
  if (includeTextExpressions && node.kind === 'dynamicText' && node.binding.kind === 'expression') {
    const segment = segmentById.get(node.binding.qrlSegmentId);
    if (segment && !qrlSegments.has(node.binding.qrlSegmentId)) {
      qrlSegments.set(node.binding.qrlSegmentId, createQrlSegmentOutput(ctx, segment));
    }
  }
  if (node.kind === 'element' || node.kind === 'fragment') {
    for (const child of node.children) {
      collectNodeQrlSegments(ctx, child, segmentById, qrlSegments, includeTextExpressions);
    }
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

async function createQrlSegmentModule(ctx: CompilerContext, qrlSegment: QrlSegmentOutput) {
  const source = createQrlSegmentSource(ctx, qrlSegment);
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

function createQrlSegmentSource(ctx: CompilerContext, qrlSegment: QrlSegmentOutput) {
  const source = ctx.input.code;
  const captures = qrlSegment.segment.captures;
  const captureLine =
    captures.length > 0
      ? `  const ${captures
          .map((capture, index) => `${capture.name} = ${QwikSymbol.Captures}[${index}]`)
          .join(', ')};\n`
      : '';
  const importLine =
    captures.length > 0
      ? `${emitImports([createQwikSparkImport(QwikSymbol.Captures)]).join('\n')}\n\n`
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

  return `${importLine}export const ${qrlSegment.symbolName} = ${
    qrlSegment.segment.async ? 'async ' : ''
  }(${params}) => {
${captureLine}${indentBody(bodyStatements)}
};
`;
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
