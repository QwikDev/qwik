/** Capture names, preludes and references: how an extracted function receives its scope. */
import {
  CaptureAccess,
  QrlBodyKind,
  QrlPayloadKind,
  type LinkedModule,
  type LinkedQrl,
  type QrlUse,
} from '../schema';
import { QwikWord } from '../words';
import { createNameAllocator } from '../names';
import type { FunctionEmission } from './emit-function';
import { chunkCanonicalFilename, type QrlResolver } from './qrl-chunks';
/** Capture names double as the chunk fn's parameters for value-payload QRLs. */
export function captureNames(module: LinkedModule, qrl: LinkedQrl): string[] {
  const allocate = createNameAllocator(module);
  return qrl.captures.map((capture) => {
    const name = module.bindings[capture.binding].name;
    return capture.access === CaptureAccess.Arguments ? allocate(`${name}Values`) : name;
  });
}

export function qrlPropsName(module: LinkedModule, qrl: LinkedQrl, fallback: string): string {
  const capture = qrl.captures.find(
    (candidate) => candidate.access === CaptureAccess.ComponentProp
  );
  return capture === undefined ? fallback : module.bindings[capture.binding].name;
}

/** A lifted local function rebinds to its imported segment and the captures restored above. */
export function functionPrelude(
  module: LinkedModule,
  qrl: LinkedQrl,
  functionReference: (use: QrlUse) => string
): string[] {
  return (qrl.functions ?? []).map(
    ({ binding, use }) => `const ${module.bindings[binding].name} = ${functionReference(use)};`
  );
}

/** The static form of a function QRL: the imported segment, bound to its captures when it has any. */
export function staticFunctionReference(
  module: LinkedModule,
  use: QrlUse,
  propsName: string,
  emission: Pick<FunctionEmission, 'imports' | 'chunkImports'>,
  resolveQrlUse: QrlResolver
): string {
  const { qrl, args } = resolveQrlUse(use, propsName);
  const line = `import { ${qrl.name} } from ${JSON.stringify(`./${chunkCanonicalFilename(module, qrl)}`)};`;
  if (!emission.chunkImports.includes(line)) {
    emission.chunkImports.push(line);
  }
  return boundReference(qrl.name, args, emission.imports);
}

/** A statically imported segment, bound to its captures when it has any. */
export function boundReference(
  name: string,
  args: readonly string[],
  imports: Set<string>
): string {
  if (args.length === 0) {
    return name;
  }
  imports.add(QwikWord.WithCaptures);
  return `${QwikWord.WithCaptures}(${name}, [${args.join(', ')}])`;
}

/** Restore native arguments from serializable values at extracted boundaries. */
export function capturePrelude(module: LinkedModule, qrl: LinkedQrl): string[] {
  const captures = captureNames(module, qrl);
  const statements =
    captures.length > 0 && qrl.payloadKind === QrlPayloadKind.Function
      ? [`const [${captures.join(', ')}] = ${QwikWord.Captures};`]
      : [];
  qrl.captures.forEach((capture, index) => {
    if (capture.access === CaptureAccess.Arguments) {
      statements.push(
        `const ${module.bindings[capture.binding].name} = (function () { 'use strict'; return arguments; })(...${captures[index]});`
      );
    }
  });
  return statements;
}

/** Serialization roots for a use site — row-index boxes never root (the block owns them). */
export function rootArgs(qrl: LinkedQrl, args: readonly string[]): string[] {
  return args.filter((_, index) => qrl.captures[index]?.access !== CaptureAccess.RowIndex);
}

/** Positional row ABI: every param up to the LAST used one stays (unused keep their names). */
export function usedParamPrefix(module: LinkedModule, qrl: LinkedQrl): string[] {
  if (qrl.body.b !== QrlBodyKind.Program) {
    return [];
  }
  const params = module.programs[qrl.body.program].params;
  const used = new Set(qrl.params.used);
  let lastUsed = -1;
  params.forEach((binding, position) => {
    if (used.has(binding)) {
      lastUsed = position;
    }
  });
  return params.slice(0, lastUsed + 1).map((binding) => module.bindings[binding].name);
}
