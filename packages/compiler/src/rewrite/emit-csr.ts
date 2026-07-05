import { emitComponentFunction, emitTemplateHtml } from './emit-html';
import type {
  Op,
  RefStep,
  RenderResult,
  RewriteComponent,
  RewriteModule,
  RewriteOutput,
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
  source: string
): RewriteModule | null {
  const hoists: string[] = [];
  const components: string[] = [];
  const imports = new Set<QwikWord>();
  for (const output of outputs) {
    const name = output.component.localName ?? output.component.exportName;
    const render = emitCsrRender(name, output.result, source, imports);
    if (render === null) {
      return null;
    }
    hoists.push(...render.hoists);
    components.push(emitCsrComponent(output.component, render));
  }
  return {
    imports: [...imports],
    code: `${hoists.join('\n')}\n${components.join('\n')}\n`,
  };
}

function emitCsrComponent(component: RewriteComponent, render: CsrRender): string {
  return emitComponentFunction(component, render.statements, render.value);
}

function emitCsrRender(
  name: string,
  result: RenderResult,
  source: string,
  imports: Set<QwikWord>
): CsrRender | null {
  if (result.root === null) {
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
  const statements = [
    ...result.setup.map((range) => source.slice(range[0], range[1]).trim()),
    `const ${fragmentName} = ${templateName}(ctx.document);`,
  ];
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
  const value = refNames.get(result.root);
  if (value === undefined) {
    return null;
  }
  imports.add(QwikWord.CreateTemplate);
  return {
    hoists: [`const ${templateName} = ${QwikWord.CreateTemplate}(${JSON.stringify(html)});`],
    statements,
    value,
  };
}

function emitCsrOp(
  op: Op,
  refNames: Map<number, string>,
  source: string,
  next: (prefix: string) => string,
  imports: Set<QwikWord>
): string[] | null {
  switch (op.kind) {
    case 'textEffect': {
      const target = refNames.get(op.marker);
      if (target === undefined) {
        return null;
      }
      if (op.trackedSource === null) {
        // ponytail: valid IR; add expression/QRL emission when text expressions land.
        return null;
      }
      const effect = next('effect');
      const expr = source.slice(op.trackedSource[0], op.trackedSource[1]);
      imports.add(QwikWord.CreateTextNodeEffect);
      return [
        `const ${effect} = ${QwikWord.CreateTextNodeEffect}(${target}, ${expr}, ctx.scheduler);`,
        `ctx.scheduler.notify(${effect});`,
      ];
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
    case 'event':
      // ponytail: valid IR, add emission here when attrs/events land.
      return [];
  }
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
  const usedRefs = new Set<number>(result.root === null ? [] : [result.root]);

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
