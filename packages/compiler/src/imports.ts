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

export function createQwikCoreImport(...specifiers: QwikSymbol[]) {
  return createNamedImport(QwikModule.Core, specifiers);
}

export function createQwikSparkImport(...specifiers: QwikSymbol[]) {
  return createNamedImport(QwikModule.Spark, specifiers);
}

export function createSsrImports(
  imports: readonly ImportRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>
) {
  if (qrlSegments.size === 0) {
    return [];
  }
  return normalizeImports([...imports, createQwikCoreImport(QwikSymbol.Qrl)]);
}

export function createCsrImports(
  imports: readonly ImportRecord[],
  qrlSegments: Map<string, QrlSegmentOutput>,
  needsTextExpression: boolean
) {
  if (qrlSegments.size === 0 && !needsTextExpression) {
    return [];
  }
  const records: ImportRecord[] = [];
  if (needsTextExpression) {
    records.push(...imports, createQwikSparkImport(QwikSymbol.CreateTextExpressionEffect));
  }
  if (qrlSegments.size > 0) {
    records.push(
      createQwikCoreImport(QwikSymbol.SetEvent),
      ...Array.from(qrlSegments.values(), (qrlSegment) =>
        createNamedImport(qrlSegment.importPath, [qrlSegment.symbolName])
      )
    );
  }
  return normalizeImports(records);
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
