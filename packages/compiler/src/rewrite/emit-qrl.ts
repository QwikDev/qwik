import type { SourceRange } from '../types';
import { isSetupQrlSegment } from './extract';
import type { Segment } from './types';
import { QwikHooks } from './words';

export type SetupQrlPart =
  | { kind: 'code'; code: string }
  | { kind: 'task'; segment: Segment; suffix: string };

export interface SetupQrlResult {
  part: SetupQrlPart;
  imports: string[];
}

export function emitSetupQrl(
  source: string,
  range: SourceRange,
  segments: readonly Segment[],
  target: 'csr' | 'ssr'
): SetupQrlResult | null {
  const qrls = segments
    .filter(
      (segment) =>
        isSetupQrlSegment(segment) &&
        segment.parentId === null &&
        segment.range[0] >= range[0] &&
        segment.range[1] <= range[1]
    )
    .sort((left, right) => left.range[0] - right.range[0]);
  if (qrls.length === 0) {
    return {
      part: { kind: 'code', code: source.slice(range[0], range[1]).trim() },
      imports: [],
    };
  }

  if (target === 'ssr') {
    const visibleTasks = qrls.filter((segment) => segment.ctxName === QwikHooks.UseVisibleTask);
    if (visibleTasks.length > 0) {
      if (visibleTasks.length !== qrls.length) {
        return null;
      }
      if (visibleTasks.length === 1 && isStandaloneCall(source, range, visibleTasks[0].range)) {
        return { part: { kind: 'code', code: '' }, imports: [] };
      }
      return {
        part: {
          kind: 'code',
          code: applyReplacements(
            source,
            range,
            visibleTasks.map((segment) => ({ range: segment.range, value: 'undefined' }))
          ).trim(),
        },
        imports: [],
      };
    }
    const task = qrls.find((segment) => segment.ctxName === QwikHooks.UseTask);
    if (task !== undefined) {
      if (qrls.length !== 1 || !isStandaloneCall(source, range, task.range)) {
        return null;
      }
      const firstArgument = task.argumentRanges[0];
      if (firstArgument === null || firstArgument === undefined) {
        return null;
      }
      return {
        part: {
          kind: 'task',
          segment: task,
          suffix: source.slice(firstArgument[1], task.range[1]),
        },
        imports: ['getActiveInvokeContextOrNull', 'invoke', 'useTaskQrl', 'runTaskSubscriber'],
      };
    }
  }

  const imports = new Set<string>();
  const replacements: Array<{ range: SourceRange; value: string }> = [];
  for (const segment of qrls) {
    const reference =
      target === 'ssr' ? emitQrlReference(segment) : emitFunctionReference(segment, imports);
    if (segment.ctxName === QwikHooks.Dollar) {
      replacements.push({ range: segment.range, value: reference });
      continue;
    }
    if (segment.calleeRange === null) {
      return null;
    }
    const callee = getTargetCallee(segment.ctxName, target);
    imports.add(callee);
    replacements.push(
      { range: segment.calleeRange, value: callee },
      { range: segment.functionRange, value: reference }
    );
  }
  return {
    part: { kind: 'code', code: applyReplacements(source, range, replacements).trim() },
    imports: [...imports],
  };
}

export function emitQrlReference(segment: Segment): string {
  const qrl = getQrlVariableName(segment);
  return segment.captures.length === 0
    ? qrl
    : `${qrl}.w([${segment.captures.map((capture) => capture.name).join(', ')}])`;
}

export function getQrlVariableName(segment: Segment): string {
  return `q_${segment.name}`;
}

export function emitFunctionReference(segment: Segment, imports: Set<string>): string {
  if (segment.captures.length === 0) {
    return segment.name;
  }
  imports.add('_withCaptures');
  return `_withCaptures(${segment.name}, [${segment.captures
    .map((capture) => capture.name)
    .join(', ')}])`;
}

export function getTargetCallee(ctxName: string, target: 'csr' | 'ssr'): string {
  const base = ctxName.slice(0, -1);
  return target === 'ssr' ? `${base}Qrl` : base;
}

function isStandaloneCall(source: string, statement: SourceRange, call: SourceRange): boolean {
  const before = source.slice(statement[0], call[0]).trim();
  const after = source.slice(call[1], statement[1]).trim();
  return before === '' && (after === '' || after === ';');
}

export function applyReplacements(
  source: string,
  range: SourceRange,
  replacements: readonly { range: SourceRange; value: string }[]
): string {
  let code = source.slice(range[0], range[1]);
  for (const replacement of [...replacements].sort(
    (left, right) => right.range[0] - left.range[0]
  )) {
    const start = replacement.range[0] - range[0];
    const end = replacement.range[1] - range[0];
    code = `${code.slice(0, start)}${replacement.value}${code.slice(end)}`;
  }
  return code;
}
