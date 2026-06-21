import type { ImportRecord, ImportSpecifierRecord, QrlSegmentOutput } from './types';
import { QwikModule, QwikSymbol } from './words';

type NamedImportSpecifierRecord = Extract<ImportSpecifierRecord, { kind: 'named' }>;

interface ImportGroup {
  source: string;
  sideEffect: boolean;
  defaultName: string | null;
  namespaceName: string | null;
  namedSpecifiers: NamedImportSpecifierRecord[];
}

export function createNamedImport(source: string, specifiers: readonly string[]): ImportRecord {
  return {
    source,
    typeOnly: false,
    specifiers: specifiers.map((specifier) => ({
      kind: 'named',
      importedName: specifier,
      localName: specifier,
      typeOnly: false,
    })),
  };
}

export function createQwikSparkImport(...specifiers: QwikSymbol[]) {
  return createNamedImport(QwikModule.Spark, specifiers);
}

export function createSsrImports(
  imports: readonly ImportRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  usage: SsrImportUsage
) {
  if (
    qrlSegments.size === 0 &&
    !usage.hasDynamicBinding &&
    !usage.hasComponent &&
    !usage.hasDomProps &&
    !usage.hasComponentPropsSpread
  ) {
    return [];
  }
  const records: ImportRecord[] = [...imports];
  const sparkSpecifiers: QwikSymbol[] = [];
  if (usage.hasComponent) {
    sparkSpecifiers.push(QwikSymbol.CreateComponent);
  }
  if (usage.hasComponentPropsSpread) {
    sparkSpecifiers.push(QwikSymbol.MergeProps);
  }
  if (qrlSegments.size > 0) {
    sparkSpecifiers.push(QwikSymbol.QrlWithChunk);
  }
  if (usage.hasSourceText || usage.hasTextExpression || usage.hasDynamicAttr) {
    sparkSpecifiers.push(QwikSymbol.EscapeHTML);
  }
  if (usage.hasSourceText) {
    sparkSpecifiers.push(QwikSymbol.RenderSsrTextNode);
  }
  if (usage.hasElementText) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrElementTextTarget);
  }
  if (usage.hasRangeText) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrRangeTextTarget);
  }
  if (usage.hasTextExpression) {
    sparkSpecifiers.push(QwikSymbol.RenderSsrTextExpression);
  }
  if (usage.hasDynamicAttr) {
    sparkSpecifiers.push(
      QwikSymbol.CreateSsrElementTarget,
      QwikSymbol.RenderSsrAttr,
      QwikSymbol.RenderSsrClass,
      QwikSymbol.RenderSsrStyle
    );
  }
  if (usage.hasDomProps) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrElementTarget, QwikSymbol.RenderSsrProps);
  }
  if (usage.hasBranch) {
    sparkSpecifiers.push(QwikSymbol.RenderSsrBranch);
  }
  if (sparkSpecifiers.length > 0) {
    records.push(createQwikSparkImport(...sparkSpecifiers));
  }
  return normalizeImports(records);
}

export interface SsrImportUsage {
  hasDynamicBinding: boolean;
  hasSourceText: boolean;
  hasElementText: boolean;
  hasRangeText: boolean;
  hasTextExpression: boolean;
  hasDynamicAttr: boolean;
  hasDomProps: boolean;
  hasBranch: boolean;
  hasComponent: boolean;
  hasComponentPropsSpread: boolean;
}

export function createCsrImports(
  imports: readonly ImportRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  usage: CsrImportUsage
) {
  if (
    qrlSegments.size === 0 &&
    !usage.hasDynamicBinding &&
    !usage.hasComponent &&
    !usage.hasDomProps &&
    !usage.hasComponentPropsSpread
  ) {
    return [];
  }
  const records: ImportRecord[] = [...imports];
  const sparkSpecifiers: QwikSymbol[] = [];
  const segmentImports: ImportRecord[] = [];
  if (usage.hasComponent) {
    sparkSpecifiers.push(QwikSymbol.CreateComponent);
  }
  if (usage.hasComponentPropsSpread) {
    sparkSpecifiers.push(QwikSymbol.MergeProps);
  }
  if (usage.hasSourceText) {
    sparkSpecifiers.push(QwikSymbol.CreateTextNodeEffect);
  }
  if (usage.hasTextExpression) {
    sparkSpecifiers.push(QwikSymbol.CreateTextExpressionEffect);
  }
  if (usage.hasDynamicAttr) {
    sparkSpecifiers.push(
      QwikSymbol.CreateAttrEffect,
      QwikSymbol.CreateClassEffect,
      QwikSymbol.CreateStyleEffect
    );
  }
  if (usage.hasDomProps) {
    sparkSpecifiers.push(QwikSymbol.CreatePropsEffect);
  }
  if (qrlSegments.size > 0) {
    if (usage.hasDirectEvent) {
      sparkSpecifiers.push(QwikSymbol.SetEvent);
    }
    if (hasCapturedQrlSegment(qrlSegments)) {
      sparkSpecifiers.push(QwikSymbol.WithCaptures);
    }
    segmentImports.push(
      ...Array.from(qrlSegments.values(), (qrlSegment) =>
        createNamedImport(qrlSegment.importPath, [qrlSegment.symbolName])
      )
    );
  }
  if (usage.hasBranch) {
    sparkSpecifiers.push(QwikSymbol.BranchRange, QwikSymbol.CreateBranch);
  }
  if (sparkSpecifiers.length > 0) {
    records.push(createQwikSparkImport(...sparkSpecifiers));
  }
  records.push(...segmentImports);
  return normalizeImports(records);
}

export interface CsrImportUsage {
  hasDynamicBinding: boolean;
  hasSourceText: boolean;
  hasTextExpression: boolean;
  hasDynamicAttr: boolean;
  hasDomProps: boolean;
  hasDirectEvent: boolean;
  hasBranch: boolean;
  hasComponent: boolean;
  hasComponentPropsSpread: boolean;
}

function hasCapturedQrlSegment(qrlSegments: Map<string, QrlSegmentOutput>) {
  for (const qrlSegment of qrlSegments.values()) {
    if (qrlSegment.segment.captures.length > 0) {
      return true;
    }
  }
  return false;
}

export function normalizeImports(imports: readonly ImportRecord[]) {
  const groups = new Map<string, ImportGroup>();
  for (const importRecord of imports) {
    if (importRecord.typeOnly) {
      continue;
    }
    const group = getImportGroup(groups, importRecord.source);
    if (importRecord.specifiers.length === 0) {
      group.sideEffect = true;
      continue;
    }
    for (const specifier of importRecord.specifiers) {
      if (specifier.kind === 'default') {
        group.defaultName ??= specifier.localName;
      } else if (specifier.kind === 'namespace') {
        group.namespaceName ??= specifier.localName;
      } else if (!specifier.typeOnly) {
        addNamedSpecifier(group, specifier.importedName, specifier.localName);
      }
    }
  }
  return Array.from(groups.values()).flatMap(createImportRecords);
}

function getImportGroup(groups: Map<string, ImportGroup>, source: string) {
  const group = groups.get(source);
  if (group) {
    return group;
  }
  const next: ImportGroup = {
    source,
    sideEffect: false,
    defaultName: null,
    namespaceName: null,
    namedSpecifiers: [],
  };
  groups.set(source, next);
  return next;
}

function addNamedSpecifier(group: ImportGroup, importedName: string, localName: string) {
  if (
    group.namedSpecifiers.some(
      (specifier) => specifier.importedName === importedName && specifier.localName === localName
    )
  ) {
    return;
  }
  group.namedSpecifiers.push({
    kind: 'named',
    importedName,
    localName,
    typeOnly: false,
  });
}

function createImportRecords(group: ImportGroup): ImportRecord[] {
  const records: ImportRecord[] = [];
  const defaultSpecifier = group.defaultName
    ? [{ kind: 'default' as const, localName: group.defaultName }]
    : [];

  if (group.namespaceName) {
    records.push({
      source: group.source,
      typeOnly: false,
      specifiers: [...defaultSpecifier, { kind: 'namespace', localName: group.namespaceName }],
    });
    if (group.namedSpecifiers.length > 0) {
      records.push({
        source: group.source,
        typeOnly: false,
        specifiers: [...group.namedSpecifiers],
      });
    }
    return records;
  }

  if (defaultSpecifier.length > 0 || group.namedSpecifiers.length > 0) {
    records.push({
      source: group.source,
      typeOnly: false,
      specifiers: [...defaultSpecifier, ...group.namedSpecifiers],
    });
    return records;
  }

  if (group.sideEffect) {
    records.push({
      source: group.source,
      typeOnly: false,
      specifiers: [],
    });
  }
  return records;
}
