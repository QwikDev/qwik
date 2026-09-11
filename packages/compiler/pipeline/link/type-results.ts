import ts from 'typescript';
import standardLibrary from 'typescript/lib/lib.es5.d.ts?raw';
import { ValueIrKind as Ir } from '../../src/expr-ir';
import type { LinkedModule, Result } from '../schema';
import { elementPath, numericPath, returnPath, type ResultPath } from './result-path';

const unknown: Result = { kind: 'unknown-result' };
const libraryPath = '/lib.es5.d.ts';

/** Query declared contracts without inferring lifetime types from initializers. */
export function createDeclaredResultReader(modules: readonly LinkedModule[]) {
  let read: ((module: number, binding: number, path: ResultPath) => Result) | undefined;
  const contracts = modules.map(
    (module) => new Set(module.source.types?.bindings.map(({ binding }) => binding))
  );
  return (module: number, binding: number, path: ResultPath): Result => {
    if (!contracts[module].has(binding)) {
      return unknown;
    }
    read ??= createReader(modules);
    return read(module, binding, path);
  };
}

function createReader(modules: readonly LinkedModule[]) {
  const files = modules.map((module, index) =>
    ts.createSourceFile(
      `/module-${index}.tsx`,
      module.source.types?.code ?? module.source.code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )
  );
  const library = ts.createSourceFile(libraryPath, standardLibrary, ts.ScriptTarget.Latest, true);
  const sources = new Map([...files, library].map((file) => [file.fileName, file]));
  const owners = new Map(files.map((file, index) => [file.fileName, index]));
  const host: ts.CompilerHost = {
    getSourceFile: (name) => sources.get(name),
    getDefaultLibFileName: () => libraryPath,
    writeFile() {},
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => sources.has(name),
    readFile: (name) => sources.get(name)?.text,
    resolveModuleNames: (names, owner) =>
      names.map((name) => {
        const module = owners.get(owner);
        const edge =
          module === undefined
            ? undefined
            : modules[module].edges.find((edge) => edge.specifier === name);
        return edge?.target.ok
          ? { resolvedFileName: files[edge.target.value].fileName, extension: ts.Extension.Tsx }
          : undefined;
      }),
  };
  const program = ts.createProgram(
    files.map((file) => file.fileName),
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      strict: true,
      noEmit: true,
      types: [],
      skipLibCheck: true,
    },
    host
  );
  const checker = program.getTypeChecker();
  const declarations = files.map((file, module) => {
    const starts = new Map(
      modules[module].source.types?.bindings.map(({ binding, start }) => [start, binding])
    );
    const bindings = new Map<number, ts.Node>();
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const binding = starts.get(node.getStart(file));
        if (binding !== undefined) {
          bindings.set(binding, node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return bindings;
  });

  function resultOf(type: ts.Type, path: ResultPath, location: ts.Node): Result {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) {
      return unknown;
    }
    if (type.flags & ts.TypeFlags.TypeParameter) {
      const constraint = checker.getBaseConstraintOfType(type);
      return constraint === undefined || constraint === type
        ? unknown
        : resultOf(constraint, path, location);
    }
    if (type.isUnion()) {
      return {
        kind: 'union-result',
        values: type.types.map((part) => resultOf(part, path, location)),
      };
    }
    if (path.length > 0) {
      const [part, ...rest] = path;
      if (part === returnPath) {
        const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
        return signatures.length === 0
          ? unknown
          : {
              kind: 'union-result',
              values: signatures.map((signature) =>
                resultOf(checker.getReturnTypeOfSignature(signature), rest, location)
              ),
            };
      }
      const index = part === elementPath || part === numericPath ? ts.IndexKind.Number : undefined;
      const property = typeof part === 'string' ? checker.getPropertyOfType(type, part) : undefined;
      const next =
        property === undefined
          ? checker.getIndexTypeOfType(
              type,
              index ??
                (typeof part === 'string' && /^\d+$/.test(part)
                  ? ts.IndexKind.Number
                  : ts.IndexKind.String)
            )
          : checker.getTypeOfSymbolAtLocation(property, location);
      if (next !== undefined) {
        return resultOf(next, rest, location);
      }
      return unknown;
    }
    if (type.isIntersection()) {
      const primitive = type.types.find(
        (part) =>
          part.flags &
          (ts.TypeFlags.StringLike |
            ts.TypeFlags.NumberLike |
            ts.TypeFlags.BigIntLike |
            ts.TypeFlags.BooleanLike)
      );
      if (primitive !== undefined) {
        return resultOf(primitive, path, location);
      }
    }
    if (type.flags & ts.TypeFlags.StringLike) {
      return { kind: 'string-result' };
    }
    if (type.flags & ts.TypeFlags.NumberLike) {
      return { kind: 'number-result' };
    }
    if (type.flags & ts.TypeFlags.BigIntLike) {
      return { kind: 'scalar-result' };
    }
    if (type.flags & (ts.TypeFlags.BooleanLike | ts.TypeFlags.Null)) {
      return { kind: Ir.Lit, value: null };
    }
    if (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
      return { kind: Ir.Undef };
    }
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      return { kind: Ir.Array, items: [] };
    }
    return unknown;
  }

  return (module: number, binding: number, path: ResultPath): Result => {
    const declaration = declarations[module].get(binding);
    return declaration === undefined
      ? unknown
      : resultOf(checker.getTypeAtLocation(declaration), path, declaration);
  };
}
