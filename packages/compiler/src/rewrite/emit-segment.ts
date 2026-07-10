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
import type { Segment } from './types';
import { QWIK_IMPORT, QwikHooks, QwikWord } from './words';

export function emitSegmentModules(
  segments: readonly Segment[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  target: 'csr' | 'ssr'
): TransformModule[] {
  return segments.map((segment) => {
    const modulePath = getSegmentModulePath(inputPath, segment);
    return createModule(
      modulePath,
      emitSegmentCode(segment, segments, source, inputPath, explicitExtensions, target),
      null,
      {
        isEntry: true,
        origPath: inputPath,
        segment: createSegmentAnalysis(segment, inputPath, source),
      }
    );
  });
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
  target: 'csr' | 'ssr'
): string {
  const imports: string[] = [];
  const qwikImports = new Set<string>();
  const children = segments.filter(
    (candidate) => candidate.parentId === segment.id && isSetupQrlSegment(candidate)
  );
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
  if (segment.moduleReferences.length > 0) {
    imports.push(
      `import { ${segment.moduleReferences.join(', ')} } from ${JSON.stringify(
        getInputImportPath(inputPath, explicitExtensions)
      )};`
    );
  }
  if (segment.captures.length > 0) {
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
  if (qwikImports.size > 0) {
    imports.push(`import { ${[...qwikImports].join(', ')} } from ${JSON.stringify(QWIK_IMPORT)};`);
  }

  const captureStatement =
    segment.captures.length === 0
      ? ''
      : `const ${segment.captures
          .map((capture, index) => `${capture.name} = ${QwikWord.Captures}[${index}]`)
          .join(', ')};`;
  const rawBody = applyReplacements(source, segment.bodyRange, replacements);
  const body = rewriteLoopCaptures(
    segment.bodyKind === 'block' ? rawBody.slice(1, -1).trim() : `return ${rawBody};`,
    segment
  );
  const statements = [captureStatement, body].filter(Boolean).map(indent).join('\n');
  const functionHead = source.slice(segment.functionRange[0], segment.bodyRange[0]);
  const declaration = `export const ${segment.name} = ${functionHead}{\n${statements}\n};`;

  const prelude = [...imports, ...childImports, ...hoists];
  return `${prelude.length > 0 ? `${prelude.join('\n')}\n\n` : ''}${declaration}\n`;
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
    paramNames: segment.paramRanges.map((range) => {
      const param = source.slice(range[0], range[1]).trim();
      return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(param) ? param : '_';
    }),
    captureNames:
      segment.captures.length > 0 ? segment.captures.map((capture) => capture.name) : undefined,
  };
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
