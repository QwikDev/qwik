import type { SegmentAnalysis, TransformModule } from '@qwik.dev/optimizer';
import { createModule } from '../../../src/module-utils';
import {
  appendCsrQrlReplacements,
  applyReplacements,
  emitCapturedFunctionReference,
  emitCapturedQrlReference,
  getNamedTargetImport,
  getQrlVariableName,
  getTargetCallee,
  TargetImportResolver,
} from '../../../src/emit-qrl';
import { emitEmbeddedRenderExpression } from '../../../src/emit-function';
import { isSetupQrlSegment } from '../../../src/extract';
import type {
  BindingId,
  ImportBinding,
  ModuleAnalysis,
  SegmentPlan,
  SegmentPropsPartPlan,
} from '../../../src/plan-types';
import type { SourceRange } from '../../../src/types';
import { getSegmentDisplayName, getSegmentSymbolHash } from '../../../src/segment-identity';
import {
  DEFAULT_GENERATED_NAMES,
  QWIK_IMPORT,
  QwikGenWord,
  QwikWord,
  type GeneratedNames,
} from '../../../src/words';
import {
  getTargetModuleReferences,
  shouldEmitSegmentModule,
  shouldResolveSsrSegment,
} from '../../../src/segment-plan';

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
  generatedNames: GeneratedNames
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
  generatedNames = DEFAULT_GENERATED_NAMES,
  libMode = false
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
      generatedNames,
      false,
      undefined,
      libMode
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

/** Hoists a lazy qrl declaration for a segment and returns its capture-bound reference. */
export function hoistLazyQrlReference(
  segment: Pick<SegmentPlan, 'symbolName'>,
  captureNames: readonly string[],
  inputPath: string,
  explicitExtensions: boolean,
  imports: Set<string>,
  hoists: string[]
): string {
  const path = getSegmentImportPath(inputPath, segment, explicitExtensions);
  imports.add(QwikWord.QrlWithChunk);
  const declaration = `const q_${segment.symbolName} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
    path
  )}, () => import(${JSON.stringify(path)}), ${JSON.stringify(segment.symbolName)});`;
  if (!hoists.includes(declaration)) {
    hoists.push(declaration);
  }
  return emitCapturedQrlReference(segment.symbolName, captureNames);
}

/**
 * In-module ssr implementation for a segment: the same generated function, without chunk imports,
 * child qrl hoists, or exports — the origin module declares every q_ name.
 */
export function emitSsrSegmentInlineCode(
  segment: SegmentPlan,
  segments: readonly SegmentPlan[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean,
  componentImports: ReadonlyMap<BindingId, SegmentComponentImport>,
  analysis: ModuleAnalysis,
  emitSegmentRender: SegmentRenderEmitter,
  generatedNames: GeneratedNames,
  qwikImportNames: Set<string>
): string | null {
  return emitSegmentCode(
    segment,
    segments,
    source,
    inputPath,
    explicitExtensions,
    componentImports,
    analysis,
    'ssr',
    emitSegmentRender,
    generatedNames,
    true,
    qwikImportNames
  );
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
  generatedNames: GeneratedNames,
  inline = false,
  inlineQwikImports?: Set<string>,
  libMode = false
): string | null {
  if (segment.implementationInOrigin) {
    // the implementation lives in the origin module, beside the state it writes
    return `export { ${segment.symbolName} } from ${JSON.stringify(
      getInputImportPath(inputPath, explicitExtensions)
    )};\n`;
  }
  const imports: string[] = [];
  const qwikImports = new Set<string>();
  // nested local components inline their bodies here, so their children belong to this chunk
  // too (their own q_ hoists come from the inline render — they are not chunk children)
  const chunkParentIds = new Set([segment.id]);
  let addedNestedParent = true;
  while (addedNestedParent) {
    addedNestedParent = false;
    for (const candidate of segments) {
      if (
        candidate.kind === 'localComponent' &&
        candidate.parentId !== null &&
        chunkParentIds.has(candidate.parentId) &&
        !chunkParentIds.has(candidate.id)
      ) {
        chunkParentIds.add(candidate.id);
        addedNestedParent = true;
      }
    }
  }
  const childSegments = segments.filter(
    (candidate) =>
      candidate.kind !== 'localComponent' &&
      candidate.parentId !== null &&
      candidate.id !== segment.id &&
      (chunkParentIds.has(candidate.parentId) ||
        // explicit boundaries nested in this segment's source range: every emitter of the
        // range owns replacing them (a props segment overlaps its structural parent)
        (candidate.qrl?.kind === 'explicit' &&
          containsRange(segment.functionRange, candidate.functionRange)))
  );
  const hasEmbeddedRenders = segment.embeddedRenders.length > 0;
  const embeddedInvokeContextName = hasEmbeddedRenders
    ? allocateGeneratedName(
        QwikGenWord.InvokeContext,
        new Set([...analysis.bindings.map((binding) => binding.name), generatedNames.ctx])
      )
    : null;
  if (hasEmbeddedRenders) {
    qwikImports.add(QwikWord.GetActiveInvokeContext);
    qwikImports.add('invoke');
  }
  const children =
    segment.render === null
      ? childSegments.filter(
          (child) =>
            isSetupQrlSegment(child) &&
            !segment.embeddedRenders.some((render) => containsRange(render.range, child.range))
        )
      : [];
  const propsBoundaryParameters = new Map<string, string>();
  const replacements: Array<{ range: SegmentPlan['range']; value: string }> = [];
  const childImports: string[] = [];
  const csrRenderChildren: SegmentPlan[] = [];
  const hoists: string[] = [];
  const qrlImports = new TargetImportResolver(analysis.bindings.map((binding) => binding.name));
  const localImplementationSource = getInputImportPath(inputPath, explicitExtensions);
  if (target === 'csr') {
    for (const child of children) {
      // explicit $() values escape into user space and keep their v2 qrl identity
      const isExplicitQrlValue = child.stripped !== true && child.qrl?.kind === 'explicit';
      if (child.stripped !== true && !isExplicitQrlValue) {
        childImports.push(
          `import { ${child.symbolName} } from ${JSON.stringify(
            getSegmentImportPath(inputPath, child, explicitExtensions)
          )};`
        );
      }
      const reference = isExplicitQrlValue
        ? hoistLazyQrlReference(
            child,
            segmentCaptureNames(child, generatedNames),
            inputPath,
            explicitExtensions,
            qwikImports,
            hoists
          )
        : emitCapturedFunctionReference(
            child.symbolName,
            segmentCaptureNames(child, generatedNames),
            qwikImports
          );
      if (
        !appendCsrQrlReplacements(
          child,
          reference,
          qrlImports,
          localImplementationSource,
          replacements,
          qwikImports
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
          // the key addresses the container's sync-function table
          value: `${callee}(${value}, ${JSON.stringify(child.symbolName)})`,
        });
        continue;
      }
      const importPath = getSegmentImportPath(inputPath, child, explicitExtensions);
      const qrl = getQrlVariableName(child);
      if (!inline) {
        if (libMode) {
          qwikImports.add(QwikWord.QrlWithChunk);
          hoists.push(
            `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
              importPath
            )}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(child.symbolName)});`
          );
        } else {
          qwikImports.add(QwikWord.NoopQrl);
          hoists.push(
            `const ${qrl} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(child.symbolName)});`
          );
        }
      }
      const reference = emitCapturedQrlReference(
        child.symbolName,
        segmentCaptureNames(child, generatedNames)
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
        if (segment.ctxName === 'componentProps') {
          // handlers in component props escape into the child: they stay qrls
          replacements.push({
            range: child.functionRange,
            value: hoistLazyQrlReference(
              child,
              segmentCaptureNames(child, generatedNames),
              inputPath,
              explicitExtensions,
              qwikImports,
              hoists
            ),
          });
        } else {
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
        }
      } else {
        const qrl = getQrlVariableName(child);
        if (!inline) {
          if (libMode) {
            qwikImports.add(QwikWord.QrlWithChunk);
            hoists.push(
              `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
                importPath
              )}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(child.symbolName)});`
            );
          } else {
            qwikImports.add(QwikWord.NoopQrl);
            hoists.push(
              `const ${qrl} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(child.symbolName)});`
            );
          }
        }
        replacements.push({
          range: child.functionRange,
          value: emitCapturedQrlReference(
            child.symbolName,
            segmentCaptureNames(child, generatedNames)
          ),
        });
      }
    }
  }
  if (segment.render !== null || hasEmbeddedRenders) {
    for (const child of childSegments) {
      if (isSetupQrlSegment(child)) {
        continue;
      }
      const importPath = getSegmentImportPath(inputPath, child, explicitExtensions);
      if (target === 'csr') {
        csrRenderChildren.push(child);
        continue;
      }
      if (inline) {
        continue;
      }
      const qrl = getQrlVariableName(child);
      let declaration: string;
      if (libMode) {
        qwikImports.add(QwikWord.QrlWithChunk);
        declaration = `const ${qrl} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(
          importPath
        )}, () => import(${JSON.stringify(importPath)}), ${JSON.stringify(child.symbolName)});`;
      } else {
        qwikImports.add(QwikWord.NoopQrl);
        declaration = `const ${qrl} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(
          child.symbolName
        )});`;
      }
      if (!libMode && shouldResolveSsrSegment(child)) {
        childImports.push(`import { ${child.symbolName} } from ${JSON.stringify(importPath)};`);
        hoists.push(`${declaration}\n${qrl}.s(${child.symbolName});`);
      } else {
        hoists.push(declaration);
      }
    }
  }
  const moduleReferences = getTargetModuleReferences(segment);
  // in-module code sees every module-scope binding directly — no reference imports
  if (!inline && moduleReferences.length > 0) {
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
  const isComponentProps = segment.ctxName === 'componentProps';
  const isExpression = segment.kind === 'expression' && !isComponentProps;
  const captureNames = segmentCaptureNames(segment, generatedNames);
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
          generatedNames
        );
  if (rendered === null) {
    return null;
  }
  const embeddedDirectSegmentIds = new Set<string>();
  for (let index = 0; index < segment.embeddedRenders.length; index++) {
    const render = segment.embeddedRenders[index];
    const embedded = emitSegmentRender(
      {
        ...segment,
        id: `${segment.id}_embedded_${index}`,
        symbolName: `${segment.symbolName}_embedded_${index}`,
        kind: 'expression',
        render,
        embeddedRenders: [],
        embeddedRenderContext: null,
        initialOnly: false,
      },
      source,
      qwikImports,
      segments,
      inputPath,
      explicitExtensions,
      generatedNames
    );
    if (embedded === null) {
      return null;
    }
    replacements.push({
      range: render.range,
      value: emitEmbeddedRenderExpression(embedded, render.async, embeddedInvokeContextName!),
    });
    hoists.push(...embedded.hoists);
    for (const id of embedded.directSegmentIds ?? []) {
      embeddedDirectSegmentIds.add(id);
    }
  }
  if (target === 'csr') {
    for (const child of csrRenderChildren) {
      if (
        rendered?.directSegmentIds?.includes(child.id) ||
        embeddedDirectSegmentIds.has(child.id)
      ) {
        childImports.push(
          `import { ${child.symbolName} } from ${JSON.stringify(
            getSegmentImportPath(inputPath, child, explicitExtensions)
          )};`
        );
      }
    }
  }
  if (qwikImports.size > 0) {
    if (inline && inlineQwikImports !== undefined) {
      // duplicate import bindings are illegal in one module — the origin merges the names
      qwikImports.forEach((name) => inlineQwikImports.add(name));
    } else {
      imports.push(
        `import { ${[...qwikImports].join(', ')} } from ${JSON.stringify(QWIK_IMPORT)};`
      );
    }
  }
  imports.push(...qrlImports.declarations({ source: QWIK_IMPORT, names: qwikImports }));

  const captureStatement =
    captureNames.length === 0 || isExpression
      ? ''
      : `const ${captureNames
          .map((name, index) => `${name} = ${QwikWord.Captures}[${index}]`)
          .join(', ')};`;
  const componentPropsSetup = emitComponentPropsSetup(segment, source, generatedNames);
  const embeddedContextStatement =
    embeddedInvokeContextName === null
      ? ''
      : [
          `const ${embeddedInvokeContextName} = ${QwikWord.GetActiveInvokeContext}();`,
          ...(segment.embeddedRenderContext === 'ambient'
            ? [`const ${generatedNames.ctx} = ${embeddedInvokeContextName}.container;`]
            : []),
        ].join('\n');
  let statements: string;
  if (rendered === undefined) {
    // last: earlier pushes replace whole lowered regions this pass must not slice into
    appendDestructuredMemberReplacements(segment, analysis, replacements);
    const rawBody = applyReplacements(source, segment.bodyRange, replacements);
    const expressionBody =
      segment.propsParts.length === 0
        ? rawBody
        : `{ ${segment.propsParts
            .map((part) => emitPropsPart(part, source, replacements, isComponentProps))
            .join(', ')} }`;
    const body =
      segment.bodyKind === 'block' ? rawBody.slice(1, -1).trim() : `return ${expressionBody};`;
    statements = [captureStatement, componentPropsSetup, embeddedContextStatement, body]
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
    return `${prelude.length > 0 ? `${prelude.join('\n')}\n\n` : ''}${inline ? '' : 'export '}const ${segment.symbolName} = ${value};\n`;
  }

  let functionHead: string;
  const usedParameterNames = getBindingNames(
    rendered?.parameterBindingIds ?? segment.usedParameterBindingIds,
    analysis
  );
  switch (segment.kind) {
    case 'expression':
      functionHead = isComponentProps
        ? '() => '
        : `(${[...captureNames, ...propsBoundaryParameters.values()].join(', ')}) => `;
      break;
    case 'collectionSource':
    case 'branchCondition':
      functionHead = '() => ';
      break;
    case 'branchRender':
    case 'suspenseRender':
    case 'slotRender':
      functionHead = `(${[
        ...(rendered?.runtimeParameters ?? [generatedNames.ctx]),
        ...(rendered?.trailingRuntimeParameters ?? []),
      ].join(', ')}) => `;
      break;
    case 'forKey':
      functionHead = `(${usedParameterNames.join(', ')}) => `;
      break;
    case 'localComponent':
      functionHead = `(${
        segment.componentParameter?.kind === 'identifier'
          ? (segment.componentParameter.param.name ?? generatedNames.props)
          : generatedNames.props
      }, ${generatedNames.ctx}) => `;
      break;
    case 'forRender':
    case 'collectionRender': {
      functionHead = `(${[
        ...(rendered?.runtimeParameters ?? [generatedNames.ctx]),
        ...usedParameterNames,
        ...(rendered?.trailingRuntimeParameters ?? []),
      ].join(', ')}) => `;
      break;
    }
    case 'event':
    case 'qrl':
    case 'pluginCallback':
      if (segment.embeddedRenderContext === 'trailing') {
        functionHead = `${segment.async ? 'async ' : ''}(${[
          ...segment.paramRanges.map((range) => source.slice(range[0], range[1])),
          generatedNames.ctx,
        ].join(', ')}) => `;
      } else {
        functionHead =
          rendered !== undefined
            ? `(${[
                ...(rendered.runtimeParameters ?? [generatedNames.ctx]),
                ...usedParameterNames,
                ...(rendered.trailingRuntimeParameters ?? []),
              ].join(', ')}) => `
            : segment.payload === 'value'
              ? '() => '
              : source.slice(segment.functionRange[0], segment.bodyRange[0]);
      }
      break;
  }
  const declaration = `${inline ? '' : 'export '}const ${segment.symbolName} = ${functionHead}{\n${statements}\n};`;

  const prelude = [...imports, ...childImports, ...hoists, ...(rendered?.hoists ?? [])];
  return `${prelude.length > 0 ? `${prelude.join('\n')}\n\n` : ''}${declaration}\n`;
}

/**
 * Captured destructured members re-read through their container so the value stays live and the
 * read tracks its slot. A segment-local binding that shadows a container name is renamed so the
 * inlined `container.prop` reads still hit the capture parameter.
 */
function appendDestructuredMemberReplacements(
  segment: SegmentPlan,
  analysis: ModuleAnalysis,
  replacements: Array<{ range: SourceRange; value: string }>
): void {
  if (analysis.destructuredMembers.size === 0) {
    return;
  }
  const bindings = new Map(analysis.bindings.map((binding) => [binding.id, binding]));
  const isSegmentLocal = (binding: { declarationRange: SourceRange | null }): boolean =>
    binding.declarationRange !== null &&
    binding.declarationRange[0] >= segment.functionRange[0] &&
    binding.declarationRange[1] <= segment.functionRange[1];
  const isInsideReplacedRegion = (range: SourceRange): boolean =>
    replacements.some(
      (replacement) => range[0] < replacement.range[1] && range[1] > replacement.range[0]
    );
  const rootNamesInUse = new Set<string>();
  const memberReads: { reference: SegmentPlan['references'][number]; value: string }[] = [];
  for (const reference of segment.references) {
    if (
      reference.bindingId === null ||
      reference.role === 'write' ||
      reference.role === 'call' ||
      reference.range[0] < segment.bodyRange[0] ||
      reference.range[1] > segment.bodyRange[1] ||
      isInsideReplacedRegion(reference.range)
    ) {
      continue;
    }
    let origin = analysis.destructuredMembers.get(reference.bindingId);
    const member = bindings.get(reference.bindingId);
    if (origin === undefined || member === undefined || isSegmentLocal(member)) {
      continue;
    }
    const path: string[] = [];
    let root = member;
    while (origin !== undefined) {
      const base = bindings.get(origin.baseBindingId);
      if (base === undefined) {
        break;
      }
      path.unshift(origin.prop);
      root = base;
      origin = analysis.destructuredMembers.get(base.id);
    }
    if (path.length === 0) {
      continue;
    }
    rootNamesInUse.add(root.name);
    const read = `${root.name}.${path.join('.')}`;
    memberReads.push({
      reference,
      value: reference.role === 'shorthand' ? `${member.name}: ${read}` : read,
    });
  }
  if (memberReads.length === 0) {
    return;
  }
  // rename segment locals that shadow a container so the inlined reads reach the capture
  const usedNames = new Set(analysis.bindings.map((binding) => binding.name));
  for (const binding of analysis.bindings) {
    if (
      !rootNamesInUse.has(binding.name) ||
      !isSegmentLocal(binding) ||
      isInsideReplacedRegion(binding.declarationRange!)
    ) {
      continue;
    }
    usedNames.add(`${binding.name}_`);
    const renamed = allocateGeneratedName(`${binding.name}_`, usedNames);
    usedNames.add(renamed);
    replacements.push({ range: binding.declarationRange!, value: renamed });
    for (const reference of segment.references) {
      if (
        reference.bindingId === binding.id &&
        reference.range[0] >= segment.bodyRange[0] &&
        reference.range[1] <= segment.bodyRange[1] &&
        !isInsideReplacedRegion(reference.range)
      ) {
        replacements.push({
          range: reference.range,
          value: reference.role === 'shorthand' ? `${binding.name}: ${renamed}` : renamed,
        });
      }
    }
  }
  replacements.push(
    ...memberReads.map(({ reference, value }) => ({ range: reference.range, value }))
  );
}

function containsRange(outer: SegmentPlan['range'], inner: SegmentPlan['range']): boolean {
  return outer[0] <= inner[0] && inner[1] <= outer[1];
}

function emitPropsPart(
  part: SegmentPropsPartPlan,
  source: string,
  replacements: readonly { range: SegmentPlan['range']; value: string }[],
  eager: boolean
): string {
  switch (part.kind) {
    case 'static':
      return `${JSON.stringify(part.prop.name)}: ${JSON.stringify(part.prop.value)}`;
    case 'expression':
      return eager
        ? `${JSON.stringify(part.name)}: ${emitPropsExpression(part.range, source, replacements)}`
        : `get ${JSON.stringify(part.name)}() { return ${emitPropsExpression(part.range, source, replacements)}; }`;
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
    displayName: getSegmentDisplayName(segment.symbolName),
    hash: getSegmentSymbolHash(segment.symbolName),
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

function segmentCaptureNames(segment: SegmentPlan, generatedNames: GeneratedNames): string[] {
  return [
    ...(segment.captures.some((capture) => capture.access === 'component-prop')
      ? [generatedNames.props]
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
  generatedNames: GeneratedNames
): string {
  const parameter = segment.componentParameter;
  if (segment.kind === 'localComponent') {
    // lifted local component: destructure its props exactly like the inline emit
    if (parameter?.kind !== 'object' || parameter.param.bindingRange === null) {
      return '';
    }
  } else if (
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
  return `const ${binding} = ${generatedNames.props}${fallback};`;
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
