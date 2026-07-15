import type { SourceRange } from './types';
import type { ImportAttributeBinding, SegmentPlan } from './plan-types';
import { QwikWord } from './words';

export function emitQrlReference(segment: SegmentPlan): string {
  return emitCapturedQrlReference(
    segment.symbolName,
    segment.captures.map((capture) => capture.name)
  );
}

export function emitCapturedQrlReference(name: string, captures: readonly string[]): string {
  const qrl = `q_${name}`;
  return captures.length === 0 ? qrl : `${qrl}.w([${captures.join(', ')}])`;
}

export function getQrlVariableName(segment: SegmentPlan): string {
  return `q_${segment.symbolName}`;
}

export interface QrlTargetImport {
  readonly local: string;
  readonly code: string | null;
}

export class TargetImportResolver {
  private readonly imports = new Map<string, QrlTargetImport>();
  private readonly usedNames: Set<string>;

  constructor(usedNames: Iterable<string> = []) {
    this.usedNames = new Set(usedNames);
  }

  addExisting(
    source: string,
    importedName: string,
    attributes: readonly ImportAttributeBinding[],
    local: string
  ): void {
    this.imports.set(targetImportKey(source, importedName, attributes), { local, code: null });
    this.usedNames.add(local);
  }

  resolve(
    source: string,
    importedName: string,
    attributes: readonly ImportAttributeBinding[]
  ): string {
    const key = targetImportKey(source, importedName, attributes);
    const existing = this.imports.get(key);
    if (existing !== undefined) {
      return existing.local;
    }
    const prefix = `__qwik_${sanitizeIdentifier(importedName)}`;
    let local = prefix;
    let suffix = 0;
    while (this.usedNames.has(local)) {
      local = `${prefix}_${suffix++}`;
    }
    this.usedNames.add(local);
    const attributeClause =
      attributes.length === 0
        ? ''
        : ` with { ${attributes
            .map(({ key, value }) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
            .join(', ')} }`;
    const imported = importedName === local ? importedName : `${importedName} as ${local}`;
    this.imports.set(key, {
      local,
      code: `import { ${imported} } from ${JSON.stringify(source)}${attributeClause};`,
    });
    return local;
  }

  declarations(): string[] {
    return [...this.imports.values()].flatMap((item) => (item.code === null ? [] : [item.code]));
  }
}

export function isModuleStyleBoundary(segment: SegmentPlan): boolean {
  return (
    segment.qrl?.kind === 'implicit' &&
    (segment.qrl.role === 'style' || segment.qrl.role === 'scoped-style')
  );
}

export function emitModuleStyleBoundary(
  segment: SegmentPlan,
  source: string,
  imports: TargetImportResolver
): string | null {
  const boundary = segment.qrl;
  const style = segment.moduleStyle;
  if (boundary?.kind !== 'implicit' || boundary.source === null || style === null) {
    return null;
  }
  const scoped = boundary.role === 'scoped-style';
  const callee = getNamedTargetImport(
    boundary.source,
    boundary.baseName,
    boundary.attributes,
    imports
  );
  const argument = source.slice(segment.functionRange[0], segment.functionRange[1]);
  const call = `${callee}(${argument}, ${JSON.stringify(style.styleId)}${scoped ? ', true' : ''})`;
  return style.resultUsed ? `({ ${scoped ? 'scopeId' : 'styleId'}: ${call} })` : call;
}

export function emitFunctionReference(segment: SegmentPlan, imports: Set<string>): string {
  return emitCapturedFunctionReference(
    segment.symbolName,
    segment.captures.map((capture) => capture.name),
    imports
  );
}

export function emitCapturedFunctionReference(
  name: string,
  captures: readonly string[],
  imports: Set<string>
): string {
  if (captures.length === 0) {
    return name;
  }
  imports.add(QwikWord.WithCaptures);
  return `${QwikWord.WithCaptures}(${name}, [${captures.join(', ')}])`;
}

export function getTargetCallee(
  segment: SegmentPlan,
  target: 'csr' | 'ssr',
  imports: TargetImportResolver,
  localSource: string | null
): string | null {
  const boundary = segment.qrl;
  if (boundary?.kind !== 'implicit') {
    return null;
  }
  const importedName = target === 'ssr' ? `${boundary.baseName}Qrl` : boundary.baseName;
  const source = boundary.source ?? localSource;
  if (source === null) {
    return importedName;
  }
  return getNamedTargetImport(
    source,
    importedName,
    boundary.source === null ? [] : boundary.attributes,
    imports
  );
}

export function getNamedTargetImport(
  source: string,
  importedName: string,
  attributes: readonly { readonly key: string; readonly value: string }[],
  imports: TargetImportResolver
): string {
  return imports.resolve(source, importedName, attributes);
}

export function appendCsrQrlReplacements(
  segment: SegmentPlan,
  reference: string,
  qrlImports: TargetImportResolver,
  localImplementationSource: string | null,
  replacements: Array<{ range: SourceRange; value: string }>
): boolean {
  const boundary = segment.qrl;
  if (boundary === null) {
    return false;
  }
  if (boundary.kind === 'explicit' || boundary.kind === 'sync') {
    replacements.push({ range: segment.range, value: reference });
    return true;
  }
  const callee = getTargetCallee(segment, 'csr', qrlImports, localImplementationSource);
  if (callee === null || segment.calleeRange === null) {
    return false;
  }
  replacements.push(
    { range: segment.calleeRange, value: callee },
    { range: segment.functionRange, value: reference }
  );
  return true;
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

function sanitizeIdentifier(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

function targetImportKey(
  source: string,
  importedName: string,
  attributes: readonly ImportAttributeBinding[]
): string {
  return `${source}\0${importedName}\0${attributes
    .map(({ key, value }) => `${key}\0${value}`)
    .join('\0')}`;
}
