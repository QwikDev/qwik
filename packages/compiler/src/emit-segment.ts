import type { SegmentAnalysis, TransformModule } from '@qwik.dev/optimizer';
import { createModule } from './module-utils';
import {
  appendCsrQrlReplacements,
  applyReplacements,
  emitCapturedFunctionReference,
  emitCapturedQrlReference,
  getNamedTargetImport,
  getQrlVariableName,
  getTargetCallee,
  TargetImportResolver,
} from './emit-qrl';
import { isSetupQrlSegment } from './extract';
import type {
  BindingId,
  ImportBinding,
  ModuleAnalysis,
  ModuleReferencePlan,
  SegmentPlan,
  SegmentPropsPartPlan,
} from './plan-types';
import { QWIK_IMPORT, QwikWord } from './words';

export interface EmittedSegmentRender {
  hoists: string[];
  statements: string[];
  value: string;
  directSegmentIds?: readonly string[];
  runtimeParameters?: readonly string[];
  trailingRuntimeParameters?: readonly string[];
  parameterBindingIds?: readonly BindingId[];
}

export interface SegmentComponentImport {
  readonly path: string;
  readonly importedName: string;
}

export type SegmentRenderEmitter = (
  segment: SegmentPlan,
  source: string,
  imports: Set<string>,
  segments: readonly SegmentPlan[],
  inputPath: string,
  explicitExtensions: boolean,
  componentPropsName: string
) => EmittedSegmentRender | null;

export function emitSegmentModules(
  segments: readonly SegmentPlan[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  componentImports: ReadonlyMap<BindingId, SegmentComponentImport>,
  analysis: ModuleAnalysis,
  target: 'csr' | 'ssr',
  emitSegmentRender: SegmentRenderEmitter,
  componentPropsName = 'props'
): TransformModule[] | null {
  const modules: TransformModule[] = [];
  for (const segment of segments) {
    if (!shouldEmitSegmentModule(segment, target)) {
      continue;
    }
    const modulePath = getSegmentModulePath(inputPath, segment);
    const code = emitSegmentCode(
      segment,
      segments,
      source,
      inputPath,
      explicitExtensions,
      componentImports,
      analysis,
      target,
      emitSegmentRender,
      componentPropsName
    );
    if (code === null) {
      return null;
    }
    modules.push(
      createModule(modulePath, code, null, {
        isEntry: true,
        origPath: inputPath,
        segment: createSegmentAnalysis(segment, inputPath, analysis),
      })
    );
  }
  return modules;
}

export function shouldEmitSegmentModule(segment: SegmentPlan, target: 'csr' | 'ssr'): boolean {
  return !(
    (target === 'ssr' && segment.qrl?.kind === 'sync') ||
    (segment.qrl?.kind === 'implicit' &&
      (segment.qrl.role === 'style' || segment.qrl.role === 'scoped-style'))
  );
}

export function getSegmentImportPath(
  inputPath: string,
  segment: Pick<SegmentPlan, 'symbolName'>,
  explicitExtensions: boolean
): string {
  const modulePath = getSegmentModulePath(inputPath, segment);
  return `./${basename(modulePath).slice(0, -3)}${explicitExtensions ? '.js' : ''}`;
}

function getSegmentModulePath(inputPath: string, segment: Pick<SegmentPlan, 'symbolName'>): string {
  return `${inputPath}_${segment.symbolName}.js`;
}

function emitSegmentCode(
  segment: SegmentPlan,
  segments: readonly SegmentPlan[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  componentImports: ReadonlyMap<BindingId, SegmentComponentImport>,
  analysis: ModuleAnalysis,
  target: 'csr' | 'ssr',
  emitSegmentRender: SegmentRenderEmitter,
  componentPropsName: string
): string | null {
  const imports: string[] = [];
  const qwikImports = new Set<string>();
  const childSegments = segments.filter((candidate) => candidate.parentId === segment.id);
  const children = childSegments.filter(isSetupQrlSegment);
  const propsBoundaryParameters = new Map<string, string>();
  const replacements: Array<{ range: SegmentPlan['range']; value: string }> = [];
  const childImports: string[] = [];
  const csrRenderChildren: SegmentPlan[] = [];
  const hoists: string[] = [];
  const qrlImports = new TargetImportResolver(analysis.bindings.map((binding) => binding.name));
  const localImplementationSource = getInputImportPath(inputPath, explicitExtensions);
  if (target === 'csr') {
    for (const child of children) {
      childImports.push(
        `import { ${child.symbolName} } from ${JSON.stringify(
          getSegmentImportPath(inputPath, child, explicitExtensions)
        )};`
      );
      const reference = emitCapturedFunctionReference(
        child.symbolName,
        segmentCaptureNames(child, componentPropsName),
        qwikImports
      );
      if (
        !appendCsrQrlReplacements(
          child,
          reference,
          qrlImports,
          localImplementationSource,
          replacements
        )
      ) {
        return null;
      }
    }
  } else {
    for (const child of children) {
      const boundary = child.qrl!;
      if (boundary.kind === 'sync') {
        const firstArg = child.argumentRanges[0];
        if (firstArg === null || firstArg === undefined) {
          return null;
        }
        const callee = getNamedTargetImport(boundary.source, '_qrlSync', [], qrlImports);
        const value = source.slice(firstArg[0], firstArg[1]);
        replacements.push({
          range: child.range,
          value: `${callee}(${value})`,
        });
        continue;
      }
      const importPath = getSegmentImportPath(inputPath, child, explicitExtensions);
      const qrl = getQrlVariableName(child);
      qwikImports.add(QwikWord.QrlWithChunk);
      hoists.push(
        `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
          importPath
        )}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(child.symbolName)});`
      );
      const reference = emitCapturedQrlReference(
        child.symbolName,
        segmentCaptureNames(child, componentPropsName)
      );
      if (boundary.kind === 'explicit') {
        replacements.push({ range: child.range, value: reference });
      } else if (child.calleeRange !== null) {
        const callee = getTargetCallee(child, 'ssr', qrlImports, localImplementationSource);
        if (callee === null) {
          return null;
        }
        replacements.push(
          { range: child.calleeRange, value: callee },
          { range: child.functionRange, value: reference }
        );
      }
    }
  }
  if (segment.propsParts.length > 0) {
    for (const child of childSegments) {
      if (child.kind !== 'event') {
        continue;
      }
      const importPath = getSegmentImportPath(inputPath, child, explicitExtensions);
      if (target === 'csr') {
        const name = allocateGeneratedName(
          '__qwikBoundary',
          new Set([
            ...analysis.bindings.map((binding) => binding.name),
            ...propsBoundaryParameters.values(),
          ])
        );
        propsBoundaryParameters.set(child.id, name);
        replacements.push({
          range: child.functionRange,
          value: name,
        });
      } else {
        const qrl = getQrlVariableName(child);
        qwikImports.add(QwikWord.QrlWithChunk);
        hoists.push(
          `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
            importPath
          )}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(child.symbolName)});`
        );
        replacements.push({
          range: child.functionRange,
          value: emitCapturedQrlReference(
            child.symbolName,
            segmentCaptureNames(child, componentPropsName)
          ),
        });
      }
    }
  }
  if (segment.render !== null) {
    for (const child of childSegments) {
      if (isSetupQrlSegment(child)) {
        continue;
      }
      const importPath = getSegmentImportPath(inputPath, child, explicitExtensions);
      if (target === 'csr') {
        csrRenderChildren.push(child);
        continue;
      }
      const qrl = getQrlVariableName(child);
      qwikImports.add(QwikWord.QrlWithChunk);
      const declaration = `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
        importPath
      )}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(child.symbolName)});`;
      if (shouldResolveSsrSegment(child)) {
        childImports.push(`import { ${child.symbolName} } from ${JSON.stringify(importPath)};`);
        hoists.push(`${declaration}\n${qrl}.s(${child.symbolName});`);
      } else {
        hoists.push(declaration);
      }
    }
  }
  const moduleReferences = getTargetModuleReferences(segment);
  if (moduleReferences.length > 0) {
    for (const reference of moduleReferences) {
      const component = componentImports.get(reference.bindingId);
      const binding: ImportBinding =
        component !== undefined
          ? {
              source: component.path,
              importedName: component.importedName,
              typeOnly: false,
              attributes: [],
            }
          : (reference.import ?? {
              source: getInputImportPath(inputPath, explicitExtensions),
              importedName: reference.name,
              typeOnly: false,
              attributes: [],
            });
      const emittedImport = emitBindingImport(binding, reference.name);
      if (emittedImport === '') {
        return null;
      }
      imports.push(emittedImport);
    }
  }
  const isExpression = segment.kind === 'expression';
  const captureNames = segmentCaptureNames(segment, componentPropsName);
  if (captureNames.length > 0 && !isExpression) {
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
  const capturesByBinding = new Map(
    segment.captures
      .filter((capture) => capture.access === 'loop-value')
      .map((capture) => [capture.bindingId, capture] as const)
  );
  for (const reference of segment.references) {
    if (
      reference.bindingId === null ||
      reference.role === 'write' ||
      reference.range[0] < segment.bodyRange[0] ||
      reference.range[1] > segment.bodyRange[1]
    ) {
      continue;
    }
    const capture = capturesByBinding.get(reference.bindingId);
    if (capture !== undefined) {
      replacements.push({
        range: reference.range,
        value:
          reference.role === 'shorthand'
            ? `${capture.name}: ${capture.name}.value`
            : `${capture.name}.value`,
      });
    }
  }
  const rendered =
    segment.render === null
      ? undefined
      : emitSegmentRender(
          segment,
          source,
          qwikImports,
          segments,
          inputPath,
          explicitExtensions,
          componentPropsName
        );
  if (rendered === null) {
    return null;
  }
  if (target === 'csr') {
    for (const child of csrRenderChildren) {
      if (rendered?.directSegmentIds?.includes(child.id)) {
        childImports.push(
          `import { ${child.symbolName} } from ${JSON.stringify(
            getSegmentImportPath(inputPath, child, explicitExtensions)
          )};`
        );
      }
    }
  }
  if (qwikImports.size > 0) {
    imports.push(`import { ${[...qwikImports].join(', ')} } from ${JSON.stringify(QWIK_IMPORT)};`);
  }
  imports.push(...qrlImports.declarations());

  const captureStatement =
    captureNames.length === 0 || isExpression
      ? ''
      : `const ${captureNames
          .map((name, index) => `${name} = ${QwikWord.Captures}[${index}]`)
          .join(', ')};`;
  const componentPropsSetup = emitComponentPropsSetup(segment, source, componentPropsName);
  let statements: string;
  if (rendered === undefined) {
    const rawBody = applyReplacements(source, segment.bodyRange, replacements);
    const expressionBody =
      segment.propsParts.length === 0
        ? rawBody
        : `{ ${segment.propsParts
            .map((part) => emitPropsPart(part, source, replacements))
            .join(', ')} }`;
    const body =
      segment.bodyKind === 'block' ? rawBody.slice(1, -1).trim() : `return ${expressionBody};`;
    statements = [captureStatement, componentPropsSetup, body]
      .filter(Boolean)
      .map(indent)
      .join('\n');
  } else {
    statements = [
      captureStatement,
      componentPropsSetup,
      ...rendered.statements,
      `return ${rendered.value};`,
    ]
      .filter(Boolean)
      .map(indent)
      .join('\n');
  }
  if (segment.kind === 'qrl' && segment.payload === 'value' && segment.captures.length === 0) {
    const value = applyReplacements(source, segment.bodyRange, replacements);
    const prelude = [...imports, ...childImports, ...hoists];
    return `${prelude.length > 0 ? `${prelude.join('\n')}\n\n` : ''}export const ${segment.symbolName} = ${value};\n`;
  }

  let functionHead: string;
  const usedParameterNames = getBindingNames(
    rendered?.parameterBindingIds ?? segment.usedParameterBindingIds,
    analysis
  );
  switch (segment.kind) {
    case 'expression':
      functionHead = `(${[...captureNames, ...propsBoundaryParameters.values()].join(', ')}) => `;
      break;
    case 'collectionSource':
    case 'branchCondition':
      functionHead = '() => ';
      break;
    case 'branchRender':
      functionHead = `(${[
        ...(rendered?.runtimeParameters ?? ['ctx']),
        ...(rendered?.trailingRuntimeParameters ?? []),
      ].join(', ')}) => `;
      break;
    case 'slotRender':
      functionHead = `(${[
        ...(rendered?.runtimeParameters ?? ['ctx']),
        ...(rendered?.trailingRuntimeParameters ?? []),
      ].join(', ')}) => `;
      break;
    case 'forKey':
      functionHead = `(${usedParameterNames.join(', ')}) => `;
      break;
    case 'forRender':
    case 'collectionRender': {
      functionHead = `(${[
        ...(rendered?.runtimeParameters ?? ['ctx']),
        ...usedParameterNames,
        ...(rendered?.trailingRuntimeParameters ?? []),
      ].join(', ')}) => `;
      break;
    }
    case 'event':
    case 'qrl':
      functionHead =
        segment.payload === 'value'
          ? '() => '
          : source.slice(segment.functionRange[0], segment.bodyRange[0]);
      break;
  }
  const declaration = `export const ${segment.symbolName} = ${functionHead}{\n${statements}\n};`;

  const prelude = [...imports, ...childImports, ...hoists, ...(rendered?.hoists ?? [])];
  return `${prelude.length > 0 ? `${prelude.join('\n')}\n\n` : ''}${declaration}\n`;
}

export function getTargetModuleReferences(segment: SegmentPlan): readonly ModuleReferencePlan[] {
  if (segment.render === null) {
    return segment.moduleReferences;
  }
  const used = new Set(segment.render.referenceBindingIds);
  return segment.moduleReferences.filter((reference) => used.has(reference.bindingId));
}

export function shouldResolveSsrSegment(segment: SegmentPlan): boolean {
  switch (segment.kind) {
    case 'expression':
    case 'collectionSource':
    case 'branchCondition':
      return true;
    case 'qrl':
      return segment.qrl?.kind === 'implicit';
    case 'branchRender':
    case 'event':
      return false;
    case 'forKey':
    case 'forRender':
    case 'collectionRender':
    case 'slotRender':
      return true;
  }
}

function emitPropsPart(
  part: SegmentPropsPartPlan,
  source: string,
  replacements: readonly { range: SegmentPlan['range']; value: string }[]
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
  range: SegmentPlan['range'],
  source: string,
  replacements: readonly { range: SegmentPlan['range']; value: string }[]
): string {
  return applyReplacements(
    source,
    range,
    replacements.filter(
      (replacement) => replacement.range[0] >= range[0] && replacement.range[1] <= range[1]
    )
  );
}

function createSegmentAnalysis(
  segment: SegmentPlan,
  inputPath: string,
  analysis: ModuleAnalysis
): SegmentAnalysis {
  const inputName = basename(inputPath);
  const captureNames = [
    ...segment.captures.map((capture) => capture.name),
    ...(segment.render?.runtimeStyleScopeName === null ||
    segment.render?.runtimeStyleScopeName === undefined
      ? []
      : [segment.render.runtimeStyleScopeName]),
  ];
  return {
    origin: inputName,
    name: segment.symbolName,
    entry: null,
    displayName: segment.symbolName,
    hash: segment.id,
    canonicalFilename: `${inputName}_${segment.symbolName}`,
    extension: 'js',
    parent: null,
    ctxKind: segment.kind === 'event' ? 'eventHandler' : 'function',
    ctxName: segment.ctxName,
    captures: captureNames.length > 0,
    loc: segment.range,
    paramNames: getParameterNames(segment, analysis),
    captureNames: captureNames.length > 0 ? captureNames : undefined,
  };
}

function getParameterNames(segment: SegmentPlan, analysis: ModuleAnalysis): string[] {
  const bindings = new Map(
    analysis.bindings
      .filter((binding) => segment.parameterBindingIds.includes(binding.id))
      .map((binding) => [binding.id, binding] as const)
  );
  return segment.paramRanges.map((range) => {
    const bindingId = segment.parameterBindingIds.find((id) => {
      const declaration = bindings.get(id)?.declarationRange;
      return declaration !== null && declaration !== undefined && sameRange(declaration, range);
    });
    return bindingId === undefined ? '_' : bindings.get(bindingId)!.name;
  });
}

function allocateGeneratedName(base: string, used: ReadonlySet<string>): string {
  let name = base;
  let index = 0;
  while (used.has(name)) {
    name = `${base}${index++}`;
  }
  return name;
}

function getBindingNames(bindingIds: readonly BindingId[], analysis: ModuleAnalysis): string[] {
  const names = new Map(analysis.bindings.map((binding) => [binding.id, binding.name] as const));
  return bindingIds.map((bindingId) => names.get(bindingId) ?? '_');
}

function segmentCaptureNames(segment: SegmentPlan, componentPropsName: string): string[] {
  return [
    ...(segment.captures.some((capture) => capture.access === 'component-prop')
      ? [componentPropsName]
      : []),
    ...segment.captures.flatMap((capture) =>
      capture.access === 'component-prop' ? [] : [capture.name]
    ),
    ...(segment.render?.runtimeStyleScopeName === null ||
    segment.render?.runtimeStyleScopeName === undefined
      ? []
      : [segment.render.runtimeStyleScopeName]),
  ];
}

function emitComponentPropsSetup(
  segment: SegmentPlan,
  source: string,
  componentPropsName: string
): string {
  const parameter = segment.componentParameter;
  if (
    parameter?.kind !== 'object' ||
    !segment.captures.some((capture) => capture.access === 'component-prop') ||
    parameter.param.bindingRange === null
  ) {
    return '';
  }
  const binding = source.slice(parameter.param.bindingRange[0], parameter.param.bindingRange[1]);
  const fallback =
    parameter.param.defaultRange === null
      ? ''
      : ` ?? ${source.slice(parameter.param.defaultRange[0], parameter.param.defaultRange[1])}`;
  return `const ${binding} = ${componentPropsName}${fallback};`;
}

export function emitBindingImport(binding: ImportBinding, localName: string): string {
  if (binding.typeOnly) {
    return '';
  }
  const attributes =
    binding.attributes.length === 0
      ? ''
      : ` with { ${binding.attributes
          .map(({ key, value }) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
          .join(', ')} }`;
  if (binding.importedName === 'default') {
    return `import ${localName} from ${JSON.stringify(binding.source)}${attributes};`;
  }
  if (binding.importedName === '*') {
    return `import * as ${localName} from ${JSON.stringify(binding.source)}${attributes};`;
  }
  const importedName = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(binding.importedName)
    ? binding.importedName
    : JSON.stringify(binding.importedName);
  const specifier =
    binding.importedName === localName ? importedName : `${importedName} as ${localName}`;
  return `import { ${specifier} } from ${JSON.stringify(binding.source)}${attributes};`;
}

function getInputImportPath(inputPath: string, explicitExtensions: boolean): string {
  const inputName = basename(inputPath).replace(/\.[cm]?[jt]sx?$/, '');
  return `./${inputName}${explicitExtensions ? '.js' : ''}`;
}

function sameRange(left: SegmentPlan['range'], right: SegmentPlan['range']): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function indent(code: string): string {
  return code
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function basename(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return slash === -1 ? path : path.slice(slash + 1);
}
