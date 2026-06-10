import type { ImportRecord, QrlSegmentOutput, SegmentRecord, SourceRange } from '../types';
import { QwikSymbol } from '../words';

export type DollarTransformTarget = 'ssr' | 'csr';

interface Replacement {
  range: SourceRange;
  value: string;
}

export function transformDollarImports(
  imports: readonly ImportRecord[],
  target: DollarTransformTarget
): ImportRecord[] {
  return imports.map((record) => ({
    ...record,
    specifiers: record.specifiers.map((specifier) => {
      if (specifier.kind !== 'named' || !isImplicitDollarName(specifier.importedName)) {
        return specifier;
      }
      return {
        ...specifier,
        importedName: getTargetName(specifier.importedName, target),
        localName: getTargetLocalName(specifier.localName, specifier.importedName, target),
      };
    }),
  }));
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
  return {
    range: callRange,
    value: `${replaceSegmentCalleeName(
      prefix,
      callRange[0],
      segment
    )}${emitQrlReference(qrlSegment)}${suffix}`,
  };
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
