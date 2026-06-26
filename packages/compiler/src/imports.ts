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
    !usage.hasComponentPropsSpread &&
    !usage.hasForBlock &&
    !usage.hasSlot &&
    !usage.hasComponentSlots
  ) {
    return [];
  }
  const records: ImportRecord[] = [...imports];
  const sparkSpecifiers: QwikSymbol[] = [];
  if (usage.hasComponent) {
    sparkSpecifiers.push(QwikSymbol.CreateComponent);
  }
  if (usage.hasComponentSlots) {
    sparkSpecifiers.push(QwikSymbol.CreateSlotScope, QwikSymbol.RegisterProjection);
  }
  if (usage.hasComponentPropsSpread) {
    sparkSpecifiers.push(QwikSymbol.MergeProps);
  }
  if (usage.hasDomBatch) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrDomBatchEffect);
    if (usage.hasDomBatchDynamicAttr || usage.hasDomBatchAttrExpression || usage.hasDomBatchProps) {
      sparkSpecifiers.push(QwikSymbol.CreateSsrElementTarget);
    }
  }
  if (qrlSegments.size > 0) {
    sparkSpecifiers.push(QwikSymbol.QrlWithChunk);
  }
  if (
    usage.hasSourceText ||
    usage.hasTextExpression ||
    usage.hasDynamicAttr ||
    usage.hasAttrExpression ||
    usage.hasDomBatchSourceText ||
    usage.hasDomBatchTextExpression ||
    usage.hasDomBatchDynamicAttr ||
    usage.hasDomBatchAttrExpression
  ) {
    sparkSpecifiers.push(QwikSymbol.EscapeHTML);
  }
  if (usage.hasSourceText || usage.hasDomBatchSourceText) {
    sparkSpecifiers.push(QwikSymbol.RenderSsrTextNode);
  }
  if (usage.hasElementText) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrElementTextTarget);
  }
  if (usage.hasRangeText) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrRangeTextTarget);
  }
  if (usage.hasTextExpression || usage.hasDomBatchTextExpression) {
    sparkSpecifiers.push(QwikSymbol.RenderSsrTextExpression);
  }
  if (usage.hasDynamicAttr || usage.hasDomBatchDynamicAttr) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrElementTarget, QwikSymbol.RenderSsrAttr);
  }
  if (usage.hasAttrExpression || usage.hasDomBatchAttrExpression) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrElementTarget, QwikSymbol.RenderSsrAttrExpression);
  }
  if (usage.hasDomProps || usage.hasDomBatchProps) {
    sparkSpecifiers.push(QwikSymbol.CreateSsrElementTarget, QwikSymbol.RenderSsrProps);
  }
  if (usage.hasBranch) {
    sparkSpecifiers.push(QwikSymbol.RenderSsrBranch);
  }
  if (usage.hasForBlock) {
    sparkSpecifiers.push(QwikSymbol.RenderSsrForBlock);
  }
  if (usage.hasSlot) {
    sparkSpecifiers.push(QwikSymbol.RenderSsrSlot);
  }
  if (sparkSpecifiers.length > 0) {
    records.push(createQwikSparkImport(...sparkSpecifiers));
  }
  return normalizeImports(records);
}

export interface SsrImportUsage {
  hasDynamicBinding: boolean;
  hasDomBatch: boolean;
  hasDomBatchSourceText: boolean;
  hasDomBatchTextExpression: boolean;
  hasDomBatchDynamicAttr: boolean;
  hasDomBatchAttrExpression: boolean;
  hasDomBatchProps: boolean;
  hasSourceText: boolean;
  hasElementText: boolean;
  hasRangeText: boolean;
  hasTextExpression: boolean;
  hasDynamicAttr: boolean;
  hasAttrExpression: boolean;
  hasDomProps: boolean;
  hasBranch: boolean;
  hasForBlock: boolean;
  hasSlot: boolean;
  hasComponent: boolean;
  hasComponentSlots: boolean;
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
    !usage.hasTemplate &&
    !usage.hasComponent &&
    !usage.hasDomProps &&
    !usage.hasDirectEvent &&
    !usage.hasComponentPropsSpread &&
    !usage.hasForBlock &&
    !usage.hasSlot &&
    !usage.hasComponentSlots
  ) {
    return [];
  }
  const records: ImportRecord[] = [...imports];
  const sparkSpecifiers: QwikSymbol[] = [];
  const segmentImports: ImportRecord[] = [];
  if (usage.hasComponent) {
    sparkSpecifiers.push(QwikSymbol.CreateComponent);
  }
  if (usage.hasComponentSlots) {
    sparkSpecifiers.push(QwikSymbol.CreateSlotScope, QwikSymbol.RegisterProjection);
  }
  if (usage.hasSlot) {
    sparkSpecifiers.push(QwikSymbol.CreateSlot);
  }
  if (usage.hasTemplate) {
    sparkSpecifiers.push(QwikSymbol.CreateTemplate);
  }
  if (usage.hasComponentPropsSpread) {
    sparkSpecifiers.push(QwikSymbol.MergeProps);
  }
  if (usage.hasDomBatch) {
    sparkSpecifiers.push(QwikSymbol.CreateDomBatchEffect);
    if (usage.hasDomBatchProps) {
      sparkSpecifiers.push(QwikSymbol.ApplyDomProps);
    }
    if (usage.hasDomBatchTextExpression) {
      sparkSpecifiers.push(QwikSymbol.PatchTextValue);
    }
    if (usage.hasDomBatchSourceText || usage.hasDomBatchDynamicAttr) {
      sparkSpecifiers.push(QwikSymbol.ReadTrackedSourceValue);
    }
    if (usage.hasDomBatchDynamicAttr || usage.hasDomBatchAttrExpression) {
      sparkSpecifiers.push(QwikSymbol.PatchAttrValue);
    }
  }
  if (usage.hasSourceText) {
    sparkSpecifiers.push(QwikSymbol.CreateTextNodeEffect);
  }
  if (usage.hasTextExpression) {
    sparkSpecifiers.push(QwikSymbol.CreateTextExpressionEffect);
  }
  if (usage.hasDynamicAttr) {
    sparkSpecifiers.push(QwikSymbol.CreateAttrEffect);
  }
  if (usage.hasAttrExpression) {
    sparkSpecifiers.push(QwikSymbol.CreateAttrExpressionEffect);
  }
  if (usage.hasDomProps) {
    sparkSpecifiers.push(QwikSymbol.CreatePropsEffect);
  }
  if (usage.hasCapturedDomPropsEvent) {
    sparkSpecifiers.push(QwikSymbol.CreateCapturedEvent);
  }
  if (usage.hasDirectEvent) {
    sparkSpecifiers.push(QwikSymbol.SetEvent);
  }
  if (qrlSegments.size > 0) {
    if (usage.hasCapturedFunction) {
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
  if (usage.hasForBlock) {
    sparkSpecifiers.push(QwikSymbol.ForRange, QwikSymbol.CreateForBlock);
  }
  if (sparkSpecifiers.length > 0) {
    records.push(createQwikSparkImport(...sparkSpecifiers));
  }
  records.push(...segmentImports);
  return normalizeImports(records);
}

export interface CsrImportUsage {
  hasDynamicBinding: boolean;
  hasTemplate: boolean;
  hasDomBatch: boolean;
  hasDomBatchSourceText: boolean;
  hasDomBatchTextExpression: boolean;
  hasDomBatchDynamicAttr: boolean;
  hasDomBatchAttrExpression: boolean;
  hasDomBatchProps: boolean;
  hasSourceText: boolean;
  hasTextExpression: boolean;
  hasDynamicAttr: boolean;
  hasAttrExpression: boolean;
  hasDomProps: boolean;
  hasDirectEvent: boolean;
  hasCapturedDomPropsEvent: boolean;
  hasCapturedFunction: boolean;
  hasBranch: boolean;
  hasForBlock: boolean;
  hasSlot: boolean;
  hasComponent: boolean;
  hasComponentSlots: boolean;
  hasComponentPropsSpread: boolean;
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
