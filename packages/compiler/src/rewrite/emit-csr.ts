import { emitComponentFunction, emitComponentProps, emitTemplateHtml } from './emit-html';
import { getDomEffectBatchKey, getDomEffectBatchKeys } from './emit-dom';
import { emitCapturedFunctionReference, emitSetupQrl } from './emit-qrl';
import { getSegmentImportPath } from './emit-segment';
import type {
  Op,
  RefStep,
  RenderResult,
  RewriteComponent,
  RewriteModule,
  RewriteOutput,
  Segment,
} from './types';
import { QwikGenWord, QwikWord } from './words';

interface CsrRender {
  hoists: string[];
  statements: string[];
  value: string;
}

interface CsrDomBatch {
  effect: string;
  update: string;
  operations: string[];
}

const REF_STEP_HELPERS: Record<RefStep, QwikWord> = {
  firstChild: QwikWord.FirstChild,
  lastChild: QwikWord.LastChild,
  nextSibling: QwikWord.NextSibling,
  previousSibling: QwikWord.PreviousSibling,
};

export function emitCsrModule(
  outputs: readonly RewriteOutput[],
  segments: readonly Segment[],
  source: string,
  inputPath: string,
  explicitExtensions: boolean
): RewriteModule | null {
  const hoists: string[] = [];
  const components: string[] = [];
  const imports = new Set<string>();
  for (const output of outputs) {
    const name = output.component.localName ?? output.component.exportName;
    const render = emitCsrRender(name, output.result, source, imports);
    if (render === null) {
      return null;
    }
    hoists.push(...render.hoists);
    components.push(emitCsrComponent(output.component, render, source));
  }
  const segmentImports = segments.map(
    (segment) =>
      `import { ${segment.name} } from ${JSON.stringify(
        getSegmentImportPath(inputPath, segment, explicitExtensions)
      )};`
  );
  return {
    imports: [...imports],
    localImports: segmentImports,
    code: `${[...hoists, ...components].join('\n')}\n`,
  };
}

function emitCsrComponent(component: RewriteComponent, render: CsrRender, source: string): string {
  return emitComponentFunction(component, render.statements, render.value, source);
}

function emitCsrRender(
  name: string,
  result: RenderResult,
  source: string,
  imports: Set<string>,
  returnFragment = false
): CsrRender | null {
  if (result.roots.length === 0) {
    return null;
  }
  const components = new Map(
    result.html.flatMap((part) =>
      part.kind === 'component' ? ([[part.target, part]] as const) : []
    )
  );
  if (result.roots.every((root) => components.has(root))) {
    const setup = emitCsrSetupStatements(result, source, imports);
    if (setup === null) {
      return null;
    }
    imports.add(QwikWord.CreateComponent);
    const next = createNameAllocator();
    const statements = [...setup];
    const values = result.roots.map((root) => {
      const component = components.get(root)!;
      const name = next('component');
      statements.push(
        `const ${name} = ${QwikWord.CreateComponent}(${emitComponentProps(component.props, source, imports)}, (props) => ${component.name}(props, ctx), { container: ctx });`
      );
      return name;
    });
    return {
      hoists: [],
      statements,
      value: values.length === 1 ? values[0] : `[${values.join(', ')}]`,
    };
  }
  const html = emitTemplateHtml(result);
  const next = createNameAllocator();
  const templateName = `${name}_${next(QwikGenWord.Template)}`;
  const fragmentName = next(QwikGenWord.Fragment);
  const refNames = new Map<number, string>();
  const textMarkers = new Set([
    ...result.ops.flatMap((op) => (op.kind === 'textEffect' ? [op.target.marker] : [])),
    ...result.html.flatMap((part) =>
      part.kind === 'dynamicJsx' ||
      part.kind === 'component' ||
      part.kind === 'branch' ||
      part.kind === 'for'
        ? [part.target]
        : []
    ),
  ]);
  const emittedRefs: { name: string; path: RefStep[] }[] = [];
  const setup = emitCsrSetupStatements(result, source, imports);
  if (setup === null) {
    return null;
  }
  const statements = [...setup, `const ${fragmentName} = ${templateName}(ctx.document);`];
  if (html === null) {
    return null;
  }
  const usedRefs = getUsedRefs(result, textMarkers);
  for (const ref of result.refs) {
    if (!usedRefs.has(ref.id)) {
      continue;
    }
    const refName = next(textMarkers.has(ref.id) ? 'text' : 'el');
    refNames.set(ref.id, refName);
    const { path, steps } = emitShortestRefPath(fragmentName, ref.path, emittedRefs);
    for (const step of steps) {
      imports.add(REF_STEP_HELPERS[step]);
    }
    statements.push(`const ${refName} = ${path};`);
    emittedRefs.push({ name: refName, path: ref.path });
  }
  for (const part of result.html) {
    switch (part.kind) {
      case 'dynamicJsx': {
        const target = refNames.get(part.target);
        if (target === undefined) {
          return null;
        }
        const jsx = next('jsx');
        statements.push(
          `const ${jsx} = ${source.slice(part.expr[0], part.expr[1])};`,
          `${target}.replaceWith(...(Array.isArray(${jsx}) ? ${jsx} : ${jsx} == null ? [] : [${jsx}]));`
        );
        break;
      }
      case 'component': {
        const target = refNames.get(part.target);
        if (target === undefined) {
          return null;
        }
        const component = next('component');
        imports.add(QwikWord.CreateComponent);
        statements.push(
          `const ${component} = ${QwikWord.CreateComponent}(${emitComponentProps(part.props, source, imports)}, (props) => ${part.name}(props, ctx), { container: ctx });`,
          `${target}.replaceWith(...(Array.isArray(${component}) ? ${component} : ${component} == null ? [] : [${component}]));`
        );
        break;
      }
      case 'branch': {
        const target = refNames.get(part.target);
        if (target === undefined) {
          return null;
        }
        const start = next('comment');
        const end = next('comment');
        const branch = next('branch');
        imports.add(QwikWord.BranchRange);
        imports.add(QwikWord.CreateBranch);
        const elseRenderer =
          part.else === null
            ? 'undefined'
            : emitCapturedFunctionReference(part.else.segment, part.else.captures, imports);
        statements.push(
          `const ${start} = ctx.document.createComment('b');`,
          `const ${end} = ctx.document.createComment('/b');`,
          `${target}.replaceWith(${start}, ${end});`,
          `const ${branch} = ${QwikWord.CreateBranch}(ctx, new ${QwikWord.BranchRange}(ctx.document, ${start}, ${end}), ${emitCapturedFunctionReference(part.condition.segment, part.condition.captures, imports)}, ${emitCapturedFunctionReference(part.then.segment, part.then.captures, imports)}, ${elseRenderer});`,
          `ctx.scheduler.notify(${branch});`
        );
        break;
      }
      case 'for': {
        const target = refNames.get(part.target);
        if (target === undefined) {
          return null;
        }
        const start = next('comment');
        const end = next('comment');
        const block = next('forBlock');
        imports.add(QwikWord.ForRange);
        imports.add(QwikWord.CreateForBlock);
        statements.push(
          `const ${start} = ctx.document.createComment('f');`,
          `const ${end} = ctx.document.createComment('/f');`,
          `${target}.replaceWith(${start}, ${end});`,
          `const ${block} = ${QwikWord.CreateForBlock}(ctx, new ${QwikWord.ForRange}(ctx.document, ${start}, ${end}), ${source.slice(part.source[0], part.source[1])}, ${emitCapturedFunctionReference(part.key.segment, part.key.captures, imports)}, ${emitCapturedFunctionReference(part.render.segment, part.render.captures, imports)}, ${part.usesItemSignal}, ${part.usesIndexSignal});`,
          `${block}.run();`
        );
        break;
      }
      default:
        break;
    }
  }
  const batchKeys = getDomEffectBatchKeys(result.ops, source);
  const batches = new Map<string, CsrDomBatch>();
  for (const op of result.ops) {
    const batchKey = getDomEffectBatchKey(op, source);
    const batch =
      batchKey !== null && batchKeys.has(batchKey)
        ? getCsrBatch(batchKey, batches, next)
        : undefined;
    const emitted = emitCsrOp(op, refNames, source, next, imports, batch);
    if (emitted === null) {
      return null;
    }
    statements.push(...emitted);
  }
  for (const batch of batches.values()) {
    imports.add(QwikWord.CreateDomBatchEffect);
    imports.add(QwikWord.RunDomBatchEffect);
    statements.push(
      `function ${batch.update}() { ${batch.operations.join(' ')} }`,
      `const ${batch.effect} = ${QwikWord.CreateDomBatchEffect}(${batch.update}, ctx.scheduler);`,
      `${QwikWord.RunDomBatchEffect}(${batch.effect}, ${batch.update});`
    );
  }
  const values: string[] = [];
  for (const root of result.roots) {
    const value = refNames.get(root);
    if (value === undefined) {
      return null;
    }
    values.push(value);
  }
  imports.add(QwikWord.CreateTemplate);
  return {
    hoists: [`const ${templateName} = ${QwikWord.CreateTemplate}(${JSON.stringify(html)});`],
    statements,
    value: returnFragment
      ? fragmentName
      : values.length === 1
        ? values[0]
        : `[${values.join(', ')}]`,
  };
}

function getCsrBatch(
  key: string,
  batches: Map<string, CsrDomBatch>,
  next: (prefix: string) => string
) {
  let batch = batches.get(key);
  if (batch === undefined) {
    batch = { effect: next('effect'), update: next('batch'), operations: [] };
    batches.set(key, batch);
  }
  return batch;
}

export function emitCsrSegmentRender(
  segment: Segment,
  source: string,
  imports: Set<string>
): CsrRender | null {
  const result = segment.render;
  if (result === undefined) {
    return null;
  }
  switch (segment.kind) {
    case 'branchRender':
      return result === null
        ? { hoists: [], statements: [], value: '[]' }
        : emitCsrRender(segment.name, result, source, imports, true);
    case 'forRender':
      return result === null ? null : emitCsrRender(segment.name, result, source, imports);
    default:
      return null;
  }
}

function emitCsrOp(
  op: Op,
  refNames: Map<number, string>,
  source: string,
  next: (prefix: string) => string,
  imports: Set<string>,
  batch?: CsrDomBatch
): string[] | null {
  switch (op.kind) {
    case 'textEffect': {
      const target = refNames.get(op.target.marker);
      if (target === undefined) {
        return null;
      }
      switch (op.binding.kind) {
        case 'source': {
          const expr = source.slice(op.binding.range[0], op.binding.range[1]);
          if (batch !== undefined) {
            imports.add(QwikWord.PatchTextValue);
            imports.add(QwikWord.ReadTrackedSourceValue);
            batch.operations.push(
              `${QwikWord.PatchTextValue}(${target}, ${QwikWord.ReadTrackedSourceValue}(${expr}));`
            );
            return [];
          }
          const effect = next('effect');
          imports.add(QwikWord.CreateTextNodeEffect);
          return [
            `const ${effect} = ${QwikWord.CreateTextNodeEffect}(${target}, ${expr}, ctx.scheduler);`,
            `ctx.scheduler.notify(${effect});`,
          ];
        }
        case 'expression': {
          if (batch !== undefined) {
            imports.add(QwikWord.PatchTextValue);
            batch.operations.push(
              `${QwikWord.PatchTextValue}(${target}, ${op.binding.segment}(${op.binding.captures.join(', ')}));`
            );
            return [];
          }
          const effect = next('effect');
          imports.add(QwikWord.CreateTextExpressionEffect);
          return [
            `const ${effect} = ${QwikWord.CreateTextExpressionEffect}(${target}, [${op.binding.captures.join(
              ', '
            )}], ${op.binding.segment}, ctx.scheduler);`,
            `ctx.scheduler.notify(${effect});`,
          ];
        }
        case 'unsupported':
          return null;
      }
      return null;
    }
    case 'attrEffect': {
      const target = refNames.get(op.target);
      if (target === undefined) {
        return null;
      }
      if (batch !== undefined) {
        imports.add(QwikWord.PatchAttrValue);
        switch (op.binding.kind) {
          case 'source': {
            const value = source.slice(op.binding.range[0], op.binding.range[1]);
            imports.add(QwikWord.ReadTrackedSourceValue);
            batch.operations.push(
              `${QwikWord.PatchAttrValue}(${target}, ${JSON.stringify(op.name)}, ${QwikWord.ReadTrackedSourceValue}(${value}));`
            );
            break;
          }
          case 'expression':
            batch.operations.push(
              `${QwikWord.PatchAttrValue}(${target}, ${JSON.stringify(op.name)}, ${op.binding.segment}(${op.binding.captures.join(', ')}));`
            );
            break;
        }
        return [];
      }
      const effect = next(QwikGenWord.Effect);
      let declaration: string;
      switch (op.binding.kind) {
        case 'source': {
          const sourceExpr = source.slice(op.binding.range[0], op.binding.range[1]);
          imports.add(QwikWord.CreateAttrEffect);
          declaration = `${QwikWord.CreateAttrEffect}(${target}, ${JSON.stringify(
            op.name
          )}, ${sourceExpr}, ctx.scheduler)`;
          break;
        }
        case 'expression':
          imports.add(QwikWord.CreateAttrExpressionEffect);
          declaration = `${QwikWord.CreateAttrExpressionEffect}(${target}, ${JSON.stringify(
            op.name
          )}, [${op.binding.captures.join(', ')}], ${op.binding.segment}, ctx.scheduler)`;
          break;
      }
      return [`const ${effect} = ${declaration};`, `ctx.scheduler.notify(${effect});`];
    }
    case 'propsEffect': {
      const target = refNames.get(op.target);
      if (target === undefined) {
        return null;
      }
      if (batch !== undefined) {
        const previous = next('prevProps');
        imports.add(QwikWord.ApplyDomProps);
        batch.operations.push(
          `${previous} = ${QwikWord.ApplyDomProps}(${target}, ${op.binding.segment}(${op.binding.captures.join(', ')}), ${previous});`
        );
        return [`let ${previous} = null;`];
      }
      const effect = next(QwikGenWord.Effect);
      imports.add(QwikWord.CreatePropsEffect);
      return [
        `const ${effect} = ${QwikWord.CreatePropsEffect}(${target}, [${op.binding.captures.join(
          ', '
        )}], ${op.binding.segment}, ctx.scheduler);`,
        `ctx.scheduler.notify(${effect});`,
      ];
    }
    case 'event': {
      const target = refNames.get(op.target);
      if (target === undefined) {
        return null;
      }
      imports.add(QwikWord.SetEvent);
      switch (op.binding.kind) {
        case 'segment': {
          const captures =
            op.binding.captures.length > 0 ? `, [${op.binding.captures.join(', ')}]` : '';
          return [
            `${QwikWord.SetEvent}(${target}, ${JSON.stringify(op.name)}, ${op.binding.segment}${captures});`,
          ];
        }
        case 'value': {
          const event = next('event');
          const value = source.slice(op.binding.range[0], op.binding.range[1]);
          return [
            `const ${event} = ${value};`,
            `if (${event}) ${QwikWord.SetEvent}(${target}, ${JSON.stringify(op.name)}, ${event});`,
          ];
        }
      }
    }
  }
}

function emitCsrSetupStatements(
  result: RenderResult,
  source: string,
  imports: Set<string>
): string[] | null {
  const statements: string[] = [];
  for (const range of result.setup) {
    const emitted = emitSetupQrl(source, range, result.segments, 'csr');
    if (emitted === null) {
      return null;
    }
    for (const name of emitted.imports) {
      imports.add(name);
    }
    if (emitted.part.kind !== 'code') {
      return null;
    }
    statements.push(emitted.part.code);
  }
  return statements;
}

function createNameAllocator() {
  const indexes = new Map<string, number>();
  return (prefix: string) => {
    const index = indexes.get(prefix) ?? 0;
    indexes.set(prefix, index + 1);
    return `${prefix}${index}`;
  };
}

function emitRefPath(root: string, path: readonly RefStep[]) {
  return path.reduce((code, step) => `${REF_STEP_HELPERS[step]}(${code})`, root);
}

function emitShortestRefPath(
  root: string,
  path: readonly RefStep[],
  refs: readonly { name: string; path: readonly RefStep[] }[]
) {
  let shortest = emitRefPath(root, path);
  let shortestRefSteps: readonly RefStep[] = path;
  for (const ref of refs) {
    if (startsWithPath(path, ref.path)) {
      const remainingPath = path.slice(ref.path.length);
      const code = emitRefPath(ref.name, remainingPath);
      if (code.length < shortest.length) {
        shortest = code;
        shortestRefSteps = remainingPath;
      }
    }
  }

  return { path: shortest, steps: shortestRefSteps };
}

function startsWithPath(path: readonly RefStep[], prefix: readonly RefStep[]) {
  return prefix.every((step, index) => path[index] === step);
}

function getUsedRefs(result: RenderResult, textMarkers: ReadonlySet<number>): Set<number> {
  const usedRefs = new Set<number>([...result.roots, ...textMarkers]);

  for (const op of result.ops) {
    switch (op.kind) {
      case 'textEffect':
        usedRefs.add(op.target.marker);
        break;
      case 'attrEffect':
      case 'propsEffect':
      case 'event':
        usedRefs.add(op.target);
        break;
    }
  }
  return usedRefs;
}
