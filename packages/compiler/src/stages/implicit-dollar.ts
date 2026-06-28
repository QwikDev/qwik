import type {
  ComponentRecord,
  ImportRecord,
  QrlSegmentOutput,
  SegmentRecord,
  SourceRange,
} from '../types';
import { QwikSymbol } from '../words';

export type DollarTransformTarget = 'ssr' | 'csr';

export interface Replacement {
  range: SourceRange;
  value: string;
}

export function transformDollarImports(
  imports: readonly ImportRecord[],
  target: DollarTransformTarget
): ImportRecord[] {
  return imports.flatMap((record) => {
    const specifiers = record.specifiers.flatMap((specifier) => {
      if (specifier.kind !== 'named' || !isImplicitDollarName(specifier.importedName)) {
        return [specifier];
      }
      if (
        target === 'ssr' &&
        (specifier.importedName === 'createTask$' ||
          specifier.importedName === 'createVisibleTask$')
      ) {
        return [];
      }
      return {
        ...specifier,
        importedName: getTargetName(specifier.importedName, target),
        localName: getTargetLocalName(specifier.localName, specifier.importedName, target),
      };
    });
    if (record.specifiers.length > 0 && specifiers.length === 0) {
      return [];
    }
    return [{ ...record, specifiers }];
  });
}

export function transformImplicitDollarCode(
  sourceCode: string,
  range: SourceRange,
  segments: readonly SegmentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  target: DollarTransformTarget
) {
  const replacements: Replacement[] = [];
  for (const segment of segments) {
    if (!isImplicitDollarSegment(segment) || !isRangeInside(segment.range, range)) {
      continue;
    }

    if (target === 'csr') {
      const fnReplacement = createTaskGeneratorReplacement(sourceCode, segment);
      if (fnReplacement) {
        replacements.push(fnReplacement);
      }
      if (segment.calleeNameRange) {
        replacements.push({
          range: segment.calleeNameRange,
          value: getSegmentTargetName(segment, target),
        });
      }
      continue;
    }

    const replacement = createSsrReplacement(sourceCode, segment, qrlSegments.get(segment.id));
    if (replacement) {
      replacements.push(replacement);
    }
  }
  return applyReplacements(sourceCode, range, replacements);
}

export function isImplicitDollarSegment(segment: SegmentRecord) {
  return segment.kind === 'function' && isImplicitDollarName(segment.ctxName);
}

export function isCreateTaskSegment(segment: SegmentRecord) {
  return isImplicitDollarSegment(segment) && segment.ctxName === 'createTask$';
}

export function isCreateVisibleTaskSegment(segment: SegmentRecord) {
  return isImplicitDollarSegment(segment) && segment.ctxName === 'createVisibleTask$';
}

export function isCreateAsyncSegment(segment: SegmentRecord) {
  return isImplicitDollarSegment(segment) && segment.ctxName === 'createAsync$';
}

export function isTaskDollarSegment(segment: SegmentRecord) {
  return isCreateTaskSegment(segment) || isCreateVisibleTaskSegment(segment);
}

export function isGeneratorTrackedSegment(segment: SegmentRecord) {
  return isTaskDollarSegment(segment) || isCreateAsyncSegment(segment);
}

export function hasTaskSetupSegment(
  component: ComponentRecord,
  segments: readonly SegmentRecord[],
  predicate: (segment: SegmentRecord) => boolean = isTaskDollarSegment
) {
  return segments.some(
    (segment) =>
      predicate(segment) &&
      component.setupRanges.some((range) => isRangeInside(segment.range, range)) &&
      !isNestedInImplicitDollarSegment(segment, segments)
  );
}

export function isNestedInImplicitDollarSegment(
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

export function isImplicitDollarName(name: string) {
  return name !== '$' && name !== QwikSymbol.Component && name.endsWith('$');
}

export function emitQrlReference(qrlSegment: QrlSegmentOutput) {
  if (qrlSegment.segment.captures.length === 0) {
    return qrlSegment.qrlVariableName;
  }
  return `${qrlSegment.qrlVariableName}.w([${qrlSegment.segment.captures
    .map((capture) => capture.name)
    .join(', ')}])`;
}

export function isRangeInside(inner: SourceRange | null, outer: SourceRange | null) {
  return !!inner && !!outer && inner[0] >= outer[0] && inner[1] <= outer[1];
}

function createSsrReplacement(
  sourceCode: string,
  segment: SegmentRecord,
  qrlSegment: QrlSegmentOutput | undefined
): Replacement | null {
  const callRange = segment.range;
  const firstArgRange = segment.argumentRanges[0];
  if (!callRange || !firstArgRange || !qrlSegment) {
    return null;
  }

  const prefix = sourceCode.slice(callRange[0], firstArgRange[0]);
  const suffix = sourceCode.slice(firstArgRange[1], callRange[1]);
  if (isCreateVisibleTaskSegment(segment)) {
    return createSsrVisibleTaskReplacement(sourceCode, callRange);
  }
  if (isCreateTaskSegment(segment)) {
    const taskValue = `${QwikSymbol.Invoke}(invokeCtx, () => ${QwikSymbol.CreateTaskQrl}(${emitQrlReference(qrlSegment)}${suffix})`;
    const taskName = `task_${segment.id}`;
    return {
      range: callRange,
      value: `const ${taskName} = ${taskValue}; ctx.addRoot(${taskName}); await ${QwikSymbol.RunTaskSubscriber}(${taskName})`,
    };
  }
  const callee = replaceSegmentCalleeName(prefix, callRange[0], segment);
  return {
    range: callRange,
    value: `${callee}${emitQrlReference(qrlSegment)}${suffix}`,
  };
}

function createSsrVisibleTaskReplacement(sourceCode: string, callRange: SourceRange): Replacement {
  const statementRange = getStandaloneCallStatementRange(sourceCode, callRange);
  return statementRange === null
    ? {
        range: callRange,
        value: 'undefined',
      }
    : {
        range: statementRange,
        value: '',
      };
}

function getStandaloneCallStatementRange(
  sourceCode: string,
  callRange: SourceRange
): SourceRange | null {
  let before = callRange[0] - 1;
  while (before >= 0 && /\s/.test(sourceCode[before])) {
    before--;
  }
  if (before >= 0 && sourceCode[before] !== '{' && sourceCode[before] !== ';') {
    return null;
  }

  let after = callRange[1];
  while (after < sourceCode.length && /\s/.test(sourceCode[after])) {
    after++;
  }
  return sourceCode[after] === ';' ? [callRange[0], after + 1] : null;
}

export function createTaskGeneratorReplacement(
  sourceCode: string,
  segment: SegmentRecord
): Replacement | null {
  if (!isGeneratorTrackedSegment(segment) || !segment.async || !segment.functionRange) {
    return null;
  }
  const params = segment.paramRanges.map(([start, end]) => sourceCode.slice(start, end)).join(', ');
  const body = segment.bodyRange
    ? rewriteAwaitToYield(sourceCode, segment.bodyRange, segment.awaitRanges)
    : 'undefined';
  const bodyStatements =
    segment.bodyKind === 'block' ? body.slice(1, -1).trim() : `return ${body};`;
  return {
    range: segment.functionRange,
    value: `function* (${params}) {\n${indentBody(bodyStatements)}\n}`,
  };
}

export function rewriteAwaitToYield(
  sourceCode: string,
  range: SourceRange,
  awaitRanges: readonly SourceRange[]
) {
  return applyReplacements(
    sourceCode,
    range,
    awaitRanges.map((awaitRange) => ({
      range: awaitRange,
      value: 'yield ',
    }))
  );
}

function indentBody(value: string) {
  return value
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n');
}

function replaceSegmentCalleeName(value: string, offset: number, segment: SegmentRecord) {
  const nameRange = segment.calleeNameRange;
  if (!nameRange || nameRange[0] < offset || nameRange[1] > offset + value.length) {
    return value;
  }
  return `${value.slice(0, nameRange[0] - offset)}${getSegmentTargetName(
    segment,
    'ssr'
  )}${value.slice(nameRange[1] - offset)}`;
}

function getSegmentTargetName(segment: SegmentRecord, target: DollarTransformTarget) {
  return getTargetLocalName(segment.calleeName ?? segment.ctxName, segment.ctxName, target);
}

function getTargetLocalName(
  localName: string,
  importedName: string,
  target: DollarTransformTarget
) {
  if (localName.endsWith('$')) {
    return getTargetName(localName, target);
  }
  return isImplicitDollarName(importedName) && target === 'ssr' ? `${localName}Qrl` : localName;
}

function getTargetName(name: string, target: DollarTransformTarget) {
  const base = name.endsWith('$') ? name.slice(0, -1) : name;
  return target === 'ssr' ? `${base}Qrl` : base;
}

function applyReplacements(sourceCode: string, range: SourceRange, replacements: Replacement[]) {
  let output = sourceCode.slice(range[0], range[1]);
  const sorted = replacements
    .filter((replacement) => isRangeInside(replacement.range, range))
    .sort((a, b) => b.range[0] - a.range[0]);

  for (const replacement of sorted) {
    const start = replacement.range[0] - range[0];
    const end = replacement.range[1] - range[0];
    output = `${output.slice(0, start)}${replacement.value}${output.slice(end)}`;
  }
  return output;
}
