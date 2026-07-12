import { emitComponentFunction, emitTemplateHtml } from './emit-html';
import { emitSetupQrl } from './emit-qrl';
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
  imports: Set<string>
): CsrRender | null {
  if (result.roots.length === 0) {
    return null;
  }
  const html = emitTemplateHtml(result);
  const next = createNameAllocator();
  const templateName = `${name}_${next(QwikGenWord.Template)}`;
  const fragmentName = next(QwikGenWord.Fragment);
  const refNames = new Map<number, string>();
  const textMarkers = new Set(
    result.ops.flatMap((op) => (op.kind === 'textEffect' ? [op.marker] : []))
  );
  const emittedRefs: { name: string; path: RefStep[] }[] = [];
  const setup = emitCsrSetupStatements(result, source, imports);
  if (setup === null) {
    return null;
  }
  const statements = [...setup, `const ${fragmentName} = ${templateName}(ctx.document);`];
  if (html === null) {
    return null;
  }
  const usedRefs = getUsedRefs(result);
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
  for (const op of result.ops) {
    const emitted = emitCsrOp(op, refNames, source, next, imports);
    if (emitted === null) {
      return null;
    }
    statements.push(...emitted);
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
    value: values.length === 1 ? values[0] : `[${values.join(', ')}]`,
  };
}

function emitCsrOp(
  op: Op,
  refNames: Map<number, string>,
  source: string,
  next: (prefix: string) => string,
  imports: Set<string>
): string[] | null {
  switch (op.kind) {
    case 'textEffect': {
      const target = refNames.get(op.marker);
      if (target === undefined) {
        return null;
      }
      switch (op.binding.kind) {
        case 'source': {
          const effect = next('effect');
          const expr = source.slice(op.binding.range[0], op.binding.range[1]);
          imports.add(QwikWord.CreateTextNodeEffect);
          return [
            `const ${effect} = ${QwikWord.CreateTextNodeEffect}(${target}, ${expr}, ctx.scheduler);`,
            `ctx.scheduler.notify(${effect});`,
          ];
        }
        case 'expression': {
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
      if (target === undefined || op.trackedSource === null) {
        return null;
      }
      const effect = next(QwikGenWord.Effect);
      const sourceExpr = source.slice(op.trackedSource[0], op.trackedSource[1]);
      imports.add(QwikWord.CreateAttrEffect);
      return [
        `const ${effect} = ${QwikWord.CreateAttrEffect}(${target}, ${JSON.stringify(
          op.name
        )}, ${sourceExpr}, ctx.scheduler);`,
        `ctx.scheduler.notify(${effect});`,
      ];
    }
    case 'event': {
      const target = refNames.get(op.target);
      if (target === undefined) {
        return null;
      }
      imports.add(QwikWord.SetEvent);
      const captures = op.captures.length > 0 ? `, [${op.captures.join(', ')}]` : '';
      return [
        `${QwikWord.SetEvent}(${target}, ${JSON.stringify(op.name)}, ${op.segment}${captures});`,
      ];
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

function getUsedRefs(result: RenderResult): Set<number> {
  const usedRefs = new Set<number>(result.roots);

  for (const op of result.ops) {
    switch (op.kind) {
      case 'textEffect':
        usedRefs.add(op.marker);
        break;
      case 'attrEffect':
      case 'event':
        usedRefs.add(op.target);
        break;
    }
  }
  return usedRefs;
}
