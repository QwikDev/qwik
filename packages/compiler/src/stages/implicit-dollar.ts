import type {
  ComponentRecord,
  ImportRecord,
  ImportSpecifierRecord,
  QrlSegmentOutput,
  SegmentRecord,
  SourceRange,
} from '../types';
import { QwikModule, QwikSymbol } from '../words';

export type DollarTransformTarget = 'ssr' | 'csr';

export interface Replacement {
  range: SourceRange;
  value: string;
}

export interface UseOnCarrier {
  segment: SegmentRecord;
  qrlSegment: QrlSegmentOutput | undefined;
  eventName: string;
  capture: boolean;
  preventdefault: boolean;
  stoppropagation: boolean;
}

export function transformDollarImports(
  imports: readonly ImportRecord[],
  target: DollarTransformTarget
): ImportRecord[] {
  return imports.flatMap((record) => {
    const specifiers: ImportSpecifierRecord[] = record.specifiers.flatMap(
      (specifier): ImportSpecifierRecord | ImportSpecifierRecord[] => {
        if (specifier.kind !== 'named') {
          return [specifier];
        }
        if (record.source === QwikModule.Core && specifier.importedName === QwikSymbol.UseId) {
          return [];
        }
        if (specifier.importedName === '$') {
          return [];
        }
        if (isCreateOnName(specifier.importedName)) {
          return [];
        }
        if (!isImplicitDollarName(specifier.importedName)) {
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
      }
    );
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
  target: DollarTransformTarget,
  skipRanges: readonly SourceRange[] = [],
  extraReplacements: Replacement[] = []
) {
  const replacements: Replacement[] = [...extraReplacements];
  for (const segment of segments) {
    if (
      !(isImplicitDollarSegment(segment) || isExplicitDollarSegment(segment)) ||
      !isRangeInside(segment.range, range) ||
      skipRanges.some((skipRange) => isRangeInside(segment.range, skipRange))
    ) {
      continue;
    }

    if (isExplicitDollarSegment(segment)) {
      const useOnCallReplacement = createUseOnCallStatementReplacement(sourceCode, segment);
      if (useOnCallReplacement !== null) {
        replacements.push(useOnCallReplacement);
        continue;
      }
    }

    if (target === 'csr') {
      if (isExplicitDollarSegment(segment)) {
        const replacement = createCsrExplicitDollarReplacement(sourceCode, segment);
        if (replacement) {
          replacements.push(replacement);
        }
        continue;
      }
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

export function isExplicitDollarSegment(segment: SegmentRecord) {
  return segment.kind === 'function' && segment.ctxName === '$';
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

export function hasSetupQrlSegment(component: ComponentRecord, segments: readonly SegmentRecord[]) {
  return segments.some(
    (segment) =>
      (isImplicitDollarSegment(segment) || isExplicitDollarSegment(segment)) &&
      component.setupRanges.some((range) => isRangeInside(segment.range, range)) &&
      !isNestedInImplicitDollarSegment(segment, segments)
  );
}

export function collectUseOnCarriers(
  component: ComponentRecord,
  segments: readonly SegmentRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  sourceCode: string
): UseOnCarrier[] {
  const carriers: UseOnCarrier[] = [];
  for (const segment of segments) {
    if (
      !isExplicitDollarSegment(segment) ||
      !component.setupRanges.some((range) => isRangeInside(segment.range, range)) ||
      isNestedInImplicitDollarSegment(segment, segments)
    ) {
      continue;
    }

    const call = segment.range === null ? null : findCreateOnCall(sourceCode, segment.range);
    if (call === null) {
      continue;
    }

    const events = parseCreateOnEvents(sourceCode.slice(call.args[0][0], call.args[0][1]));
    if (events.length === 0) {
      continue;
    }

    const options = parseCreateOnOptions(
      call.args[2] ? sourceCode.slice(call.args[2][0], call.args[2][1]) : ''
    );
    const scope = getCreateOnScope(call.name, options.passive);
    for (const event of events) {
      carriers.push({
        segment,
        qrlSegment: qrlSegments.get(segment.id),
        eventName: scope + fromCamelToKebabCase(event),
        capture: options.capture,
        preventdefault: options.preventdefault,
        stoppropagation: options.stoppropagation,
      });
    }
  }
  return carriers;
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

function isCreateOnName(name: string) {
  return name === 'createOn' || name === 'createOnDocument' || name === 'createOnWindow';
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
  if (isExplicitDollarSegment(segment)) {
    return {
      range: callRange,
      value: emitQrlReference(qrlSegment),
    };
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

function createCsrExplicitDollarReplacement(
  sourceCode: string,
  segment: SegmentRecord
): Replacement | null {
  const callRange = segment.range;
  const firstArgRange = segment.argumentRanges[0];
  if (!callRange || !firstArgRange) {
    return null;
  }
  return {
    range: callRange,
    value: sourceCode.slice(firstArgRange[0], firstArgRange[1]),
  };
}

function createUseOnCallStatementReplacement(
  sourceCode: string,
  segment: SegmentRecord
): Replacement | null {
  if (segment.range === null) {
    return null;
  }
  const call = findCreateOnCall(sourceCode, segment.range);
  if (
    call === null ||
    parseCreateOnEvents(sourceCode.slice(call.args[0][0], call.args[0][1])).length === 0
  ) {
    return null;
  }
  const statementRange = getStandaloneCallStatementRange(sourceCode, call.range);
  return statementRange === null ? null : { range: statementRange, value: '' };
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

function findCreateOnCall(
  sourceCode: string,
  segmentRange: SourceRange
): { name: string; args: SourceRange[]; range: SourceRange; start: number } | null {
  const names = ['createOnDocument', 'createOnWindow', 'createOn'];
  let best: { name: string; args: SourceRange[]; range: SourceRange; start: number } | null = null;
  for (const name of names) {
    let index = sourceCode.lastIndexOf(name, segmentRange[0]);
    while (index !== -1) {
      const call = parseNamedCall(sourceCode, name, index);
      if (
        call &&
        call.args.length >= 2 &&
        isRangeInside(segmentRange, call.args[1]) &&
        (best === null || call.start > best.start)
      ) {
        best = call;
        break;
      }
      index = sourceCode.lastIndexOf(name, index - 1);
    }
  }
  return best;
}

function parseNamedCall(
  sourceCode: string,
  name: string,
  start: number
): { name: string; args: SourceRange[]; range: SourceRange; start: number } | null {
  if (
    isIdent(sourceCode.charCodeAt(start - 1)) ||
    isIdent(sourceCode.charCodeAt(start + name.length))
  ) {
    return null;
  }
  let open = start + name.length;
  while (/\s/.test(sourceCode[open])) {
    open++;
  }
  if (sourceCode[open] !== '(') {
    return null;
  }
  const close = findMatchingParen(sourceCode, open);
  return close === -1
    ? null
    : {
        name,
        args: splitTopLevelArgs(sourceCode, open + 1, close),
        range: [start, close + 1],
        start,
      };
}

function parseCreateOnEvents(source: string): string[] {
  const trimmed = source.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return splitTopLevelArgs(trimmed, 1, trimmed.length - 1)
      .map(([start, end]) => parseStringLiteral(trimmed.slice(start, end)))
      .filter((event): event is string => event !== null);
  }
  const event = parseStringLiteral(trimmed);
  return event === null ? [] : [event];
}

function parseCreateOnOptions(source: string): {
  passive: boolean;
  capture: boolean;
  preventdefault: boolean;
  stoppropagation: boolean;
} {
  return {
    passive: /\bpassive\s*:\s*true\b/.test(source),
    capture: /\bcapture\s*:\s*true\b/.test(source),
    preventdefault: /\bpreventdefault\s*:\s*true\b/.test(source),
    stoppropagation: /\bstoppropagation\s*:\s*true\b/.test(source),
  };
}

function getCreateOnScope(name: string, passive: boolean): string {
  if (name === 'createOnDocument') {
    return passive ? 'q-dp:' : 'q-d:';
  }
  if (name === 'createOnWindow') {
    return passive ? 'q-wp:' : 'q-w:';
  }
  return passive ? 'q-ep:' : 'q-e:';
}

function fromCamelToKebabCase(value: string): string {
  return value.replace(/([A-Z-])/g, (part) => '-' + part.toLowerCase());
}

function parseStringLiteral(source: string): string | null {
  const trimmed = source.trim();
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
    return null;
  }
  if (quote === '"') {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return null;
    }
  }
  return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function splitTopLevelArgs(source: string, start: number, end: number): SourceRange[] {
  const args: SourceRange[] = [];
  let argStart = start;
  let depth = 0;
  let quote = '';
  for (let i = start; i < end; i++) {
    const char = source[i];
    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      depth++;
      continue;
    }
    if (char === ')' || char === ']' || char === '}') {
      depth--;
      continue;
    }
    if (char === ',' && depth === 0) {
      pushArg(args, source, argStart, i);
      argStart = i + 1;
    }
  }
  pushArg(args, source, argStart, end);
  return args;
}

function pushArg(args: SourceRange[], source: string, start: number, end: number): void {
  while (start < end && /\s/.test(source[start])) {
    start++;
  }
  while (end > start && /\s/.test(source[end - 1])) {
    end--;
  }
  if (start < end) {
    args.push([start, end]);
  }
}

function findMatchingParen(source: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function isIdent(char: number): boolean {
  return (
    (char >= 48 && char <= 57) ||
    (char >= 65 && char <= 90) ||
    (char >= 97 && char <= 122) ||
    char === 36 ||
    char === 95
  );
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

export function applyReplacements(
  sourceCode: string,
  range: SourceRange,
  replacements: Replacement[]
) {
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
