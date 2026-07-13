import type { SegmentAnalysis, TransformModule } from '@qwik.dev/optimizer';
import { createModule } from '../module-utils';
import {
  applyReplacements,
  emitFunctionReference,
  emitQrlReference,
  getQrlVariableName,
  getTargetCallee,
} from './emit-qrl';
import { isSetupQrlSegment } from './extract';
import type { PropsExpressionPart, Segment } from './types';
import { QWIK_IMPORT, QwikHooks, QwikWord } from './words';

export interface EmittedSegmentRender {
  hoists: string[];
  statements: string[];
  value: string;
}

export type SegmentRenderEmitter = (
  segment: Segment,
  source: string,
  imports: Set<string>
) => EmittedSegmentRender | null;

export function emitSegmentModules(
  segments: readonly Segment[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  componentImportPaths: ReadonlyMap<string, string>,
  target: 'csr' | 'ssr',
  emitSegmentRender: SegmentRenderEmitter
): TransformModule[] | null {
  const modules: TransformModule[] = [];
  for (const segment of segments) {
    const modulePath = getSegmentModulePath(inputPath, segment);
    const code = emitSegmentCode(
      segment,
      segments,
      source,
      inputPath,
      explicitExtensions,
      componentImportPaths,
      target,
      emitSegmentRender
    );
    if (code === null) {
      return null;
    }
    modules.push(
      createModule(modulePath, code, null, {
        isEntry: true,
        origPath: inputPath,
        segment: createSegmentAnalysis(segment, inputPath, source),
      })
    );
  }
  return modules;
}

export function getSegmentImportPath(
  inputPath: string,
  segment: Segment,
  explicitExtensions: boolean
): string {
  const modulePath = getSegmentModulePath(inputPath, segment);
  return `./${basename(modulePath).slice(0, -3)}${explicitExtensions ? '.js' : ''}`;
}

function getSegmentModulePath(inputPath: string, segment: Segment): string {
  return `${inputPath}_${segment.name}.js`;
}

function emitSegmentCode(
  segment: Segment,
  segments: readonly Segment[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  componentImportPaths: ReadonlyMap<string, string>,
  target: 'csr' | 'ssr',
  emitSegmentRender: SegmentRenderEmitter
): string | null {
  const imports: string[] = [];
  const qwikImports = new Set<string>();
  const childSegments = segments.filter((candidate) => candidate.parentId === segment.id);
  const children = childSegments.filter(isSetupQrlSegment);
  const replacements: Array<{ range: Segment['range']; value: string }> = [];
  const childImports: string[] = [];
  const hoists: string[] = [];
  for (const child of children) {
    let reference: string;
    if (target === 'ssr') {
      const importPath = getSegmentImportPath(inputPath, child, explicitExtensions);
      const qrl = getQrlVariableName(child);
      qwikImports.add(QwikWord.QrlWithChunk);
      hoists.push(
        `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
          importPath
        )}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(child.name)});`
      );
      reference = emitQrlReference(child);
    } else {
      childImports.push(
        `import { ${child.name} } from ${JSON.stringify(
          getSegmentImportPath(inputPath, child, explicitExtensions)
        )};`
      );
      reference = emitFunctionReference(child, qwikImports);
    }
    if (child.ctxName === QwikHooks.Dollar) {
      replacements.push({ range: child.range, value: reference });
    } else if (child.calleeRange !== null) {
      const callee = getTargetCallee(child.ctxName, target);
      qwikImports.add(callee);
      replacements.push(
        { range: child.calleeRange, value: callee },
        { range: child.functionRange, value: reference }
      );
    }
  }
  if (segment.render !== undefined) {
    for (const child of childSegments) {
      if (isSetupQrlSegment(child)) {
        continue;
      }
      const importPath = getSegmentImportPath(inputPath, child, explicitExtensions);
      if (target === 'csr') {
        childImports.push(`import { ${child.name} } from ${JSON.stringify(importPath)};`);
        continue;
      }
      const qrl = getQrlVariableName(child);
      qwikImports.add(QwikWord.QrlWithChunk);
      const declaration = `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
        importPath
      )}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(child.name)});`;
      if (shouldResolveSsrSegment(child)) {
        childImports.push(`import { ${child.name} } from ${JSON.stringify(importPath)};`);
        hoists.push(`${declaration}\n${qrl}.s(${child.name});`);
      } else {
        hoists.push(declaration);
      }
    }
  }
  if (segment.moduleReferences.length > 0) {
    for (const name of segment.moduleReferences) {
      imports.push(
        `import { ${name} } from ${JSON.stringify(
          componentImportPaths.get(name) ?? getInputImportPath(inputPath, explicitExtensions)
        )};`
      );
    }
  }
  const isExpression = segment.kind === 'expression';
  if (segment.captures.length > 0 && !isExpression) {
    qwikImports.add(QwikWord.Captures);
  }
  if (segment.awaits.length > 0) {
    qwikImports.add(QwikWord.Await);
    for (const awaitExpression of segment.awaits) {
      replacements.push(
        { range: [awaitExpression.range[0], awaitExpression.range[0]], value: '(' },
        {
          range: [awaitExpression.argumentRange[0], awaitExpression.argumentRange[0]],
          value: `${QwikWord.Await}(`,
        },
        { range: [awaitExpression.range[1], awaitExpression.range[1]], value: '))()' }
      );
    }
  }
  const rendered =
    segment.render === undefined ? undefined : emitSegmentRender(segment, source, qwikImports);
  if (rendered === null) {
    return null;
  }
  if (qwikImports.size > 0) {
    imports.push(`import { ${[...qwikImports].join(', ')} } from ${JSON.stringify(QWIK_IMPORT)};`);
  }

  const captureStatement =
    segment.captures.length === 0 || isExpression
      ? ''
      : `const ${segment.captures
          .map((capture, index) => `${capture.name} = ${QwikWord.Captures}[${index}]`)
          .join(', ')};`;
  let statements: string;
  if (rendered === undefined) {
    const rawBody = applyReplacements(source, segment.bodyRange, replacements);
    const expressionBody =
      segment.propsParts === undefined
        ? rawBody
        : `{ ${segment.propsParts
            .map((part) => emitPropsPart(part, source, replacements))
            .join(', ')} }`;
    const body = rewriteLoopCaptures(
      segment.bodyKind === 'block' ? rawBody.slice(1, -1).trim() : `return ${expressionBody};`,
      segment
    );
    statements = [captureStatement, body].filter(Boolean).map(indent).join('\n');
  } else {
    statements = [captureStatement, ...rendered.statements, `return ${rendered.value};`]
      .filter(Boolean)
      .map(indent)
      .join('\n');
  }
  let functionHead: string;
  switch (segment.kind) {
    case 'expression':
      functionHead = `(${segment.captures.map((capture) => capture.name).join(', ')}) => `;
      break;
    case 'branchCondition':
      functionHead = '() => ';
      break;
    case 'branchRender':
      functionHead =
        target === 'ssr' && segment.render !== undefined ? '(ctx, rangeId) => ' : '(ctx) => ';
      break;
    case 'slotRender':
      functionHead = target === 'ssr' ? '(ctx, rangeId) => ' : '(ctx) => ';
      break;
    case 'forKey':
      functionHead = `(${segment.paramRanges.map((range) => getParamName(range, source)).join(', ')}) => `;
      break;
    case 'forRender': {
      const params = segment.paramRanges.map((range) => getParamName(range, source));
      const item = params[0] ?? 'item';
      const index = params[1] ?? 'index';
      functionHead =
        target === 'ssr'
          ? `(ctx, rangeId, rowId, ${item}, ${index}) => `
          : `(ctx, ${item}, ${index}) => `;
      break;
    }
    case 'event':
    case 'qrl':
      functionHead = source.slice(segment.functionRange[0], segment.bodyRange[0]);
      break;
  }
  const declaration = `export const ${segment.name} = ${functionHead}{\n${statements}\n};`;

  const prelude = [...imports, ...childImports, ...hoists, ...(rendered?.hoists ?? [])];
  return `${prelude.length > 0 ? `${prelude.join('\n')}\n\n` : ''}${declaration}\n`;
}

export function shouldResolveSsrSegment(segment: Segment): boolean {
  switch (segment.kind) {
    case 'expression':
    case 'branchCondition':
      return true;
    case 'qrl':
      return segment.ctxName !== QwikHooks.Dollar;
    case 'branchRender':
    case 'event':
      return false;
    case 'forKey':
    case 'forRender':
    case 'slotRender':
      return true;
  }
}

function emitPropsPart(
  part: PropsExpressionPart,
  source: string,
  replacements: readonly { range: Segment['range']; value: string }[]
): string {
  switch (part.kind) {
    case 'static':
      return `${JSON.stringify(part.prop.name)}: ${JSON.stringify(part.prop.value)}`;
    case 'expression':
      return `get ${JSON.stringify(part.name)}() { return ${emitPropsExpression(part.range, source, replacements)}; }`;
    case 'spread':
      return `...(${emitPropsExpression(part.range, source, replacements)})`;
  }
}

function emitPropsExpression(
  range: Segment['range'],
  source: string,
  replacements: readonly { range: Segment['range']; value: string }[]
): string {
  return applyReplacements(
    source,
    range,
    replacements.filter(
      (replacement) => replacement.range[0] >= range[0] && replacement.range[1] <= range[1]
    )
  );
}

function rewriteLoopCaptures(body: string, segment: Segment): string {
  let rewritten = body;
  for (const capture of segment.captures) {
    if (capture.source === 'loop') {
      rewritten = rewritten.replace(
        new RegExp(`(?<![.$])\\b${escapeRegExp(capture.name)}\\b`, 'g'),
        `${capture.name}.value`
      );
    }
  }
  return rewritten;
}

function createSegmentAnalysis(
  segment: Segment,
  inputPath: string,
  source: string
): SegmentAnalysis {
  const inputName = basename(inputPath);
  return {
    origin: inputName,
    name: segment.name,
    entry: null,
    displayName: segment.name,
    hash: segment.id,
    canonicalFilename: `${inputName}_${segment.name}`,
    extension: 'js',
    parent: null,
    ctxKind: segment.kind === 'event' ? 'eventHandler' : 'function',
    ctxName: segment.ctxName,
    captures: segment.captures.length > 0,
    loc: segment.range,
    paramNames: segment.paramRanges.map((range) => getParamName(range, source)),
    captureNames:
      segment.captures.length > 0 ? segment.captures.map((capture) => capture.name) : undefined,
  };
}

function getParamName(range: Segment['range'], source: string): string {
  const param = source.slice(range[0], range[1]).trim();
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(param) ? param : '_';
}

function getInputImportPath(inputPath: string, explicitExtensions: boolean): string {
  const inputName = basename(inputPath).replace(/\.[cm]?[jt]sx?$/, '');
  return `./${inputName}${explicitExtensions ? '.js' : ''}`;
}

function indent(code: string): string {
  return code
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function basename(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return slash === -1 ? path : path.slice(slash + 1);
}
