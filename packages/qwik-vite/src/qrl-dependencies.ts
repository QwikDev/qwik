import { ScopeTracker, walk, type ScopeTrackerNode, type WalkOptions } from 'oxc-walker';
import type { Rolldown } from 'vite';
import { isStrippedSegment } from '../../ts-optimizer/src/optimizer/rewrite/predicates';
import { CLIENT_STRIP_CTX_NAME } from './strip-contexts';
import type { QwikManifest } from './types';

type Node = Parameters<NonNullable<WalkOptions['enter']>>[0];
type FunctionNode = Extract<ScopeTrackerNode, { type: 'Function' }>['node'];
type Values = Value[];
type Environment = Map<Node, Values>;
type Value =
  | { kind: 'qrl'; symbol: string; captures?: Values[] }
  | { kind: 'function'; node: FunctionNode; module: Module; environment: Environment }
  | { kind: 'object'; properties: Map<string, Values> }
  | { kind: 'namespace'; file: string };
type Reference = { file: string; name: string; exported?: boolean };
type Module = {
  file: string;
  bindings: Map<string, Node>;
  references: Map<Node, ScopeTrackerNode>;
  exports: Map<string, Reference | Node>;
  reexports: string[];
};

const propertyName = (node: Node): string | undefined => {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'Literal') {
    return String(node.value);
  }
};

const resolveFile = (file: string, source: string) => {
  const parts = file.split('/');
  parts.pop();
  for (const part of source.split('/')) {
    if (part === '..') {
      parts.pop();
    } else if (part && part !== '.') {
      parts.push(part);
    }
  }
  return parts.join('/');
};

/** Follow calls and returned values without executing application code. */
export function collectQrlDependencies(
  chunks: Map<string, Rolldown.OutputChunk>,
  manifest: QwikManifest,
  parse: Rolldown.PluginContext['parse']
) {
  const modules = new Map<string, Module>();
  for (const [file, chunk] of chunks) {
    if (file === manifest.core || !chunk.code) {
      continue;
    }
    const program = parse(chunk.code);
    const module: Module = {
      file,
      bindings: new Map(),
      references: new Map(),
      exports: new Map(),
      reexports: [],
    };
    const scopeTracker = new ScopeTracker({ preserveExitedScopes: true });
    walk(program, { scopeTracker });
    scopeTracker.freeze();
    walk(program, {
      scopeTracker,
      enter(node) {
        if (node.type !== 'Identifier') {
          return;
        }
        const declaration = scopeTracker.getDeclaration(node.name);
        if (declaration) {
          module.references.set(node, declaration);
          if (declaration.scope === '') {
            module.bindings.set(node.name, node);
          }
        }
      },
    });
    for (const statement of program.body) {
      if (statement.type === 'ExportAllDeclaration') {
        module.reexports.push(resolveFile(file, statement.source.value));
      } else if (statement.type === 'ExportDefaultDeclaration') {
        module.exports.set('default', statement.declaration);
      } else if (statement.type === 'ExportNamedDeclaration') {
        for (const specifier of statement.specifiers) {
          module.exports.set(propertyName(specifier.exported)!, {
            file: statement.source ? resolveFile(file, statement.source.value) : file,
            name: propertyName(specifier.local)!,
            exported: !!statement.source,
          });
        }
      }
    }
    for (const name of chunk.exports) {
      if (!module.exports.has(name) && module.bindings.has(name)) {
        module.exports.set(name, { file, name });
      }
    }
    modules.set(file, module);
  }

  const result = new Map<string, string[]>();
  for (const [symbol, file] of Object.entries(manifest.mapping)) {
    const dependencies = new Set<string>();
    const activeFunctions = new Set<Node>();
    const activeExports = new Set<string>();
    let captures: Values[] = [];

    const readExport = (file: string, name: string, environment: Environment): Values => {
      const module = modules.get(file);
      const key = `${file}:${name}`;
      if (!module || activeExports.has(key)) {
        return [];
      }
      activeExports.add(key);
      const target = module.exports.get(name);
      let values: Values = [];
      if (target && 'type' in target) {
        values = evaluate(target, module, environment);
      } else if (target) {
        values = target.exported
          ? readExport(target.file, target.name, environment)
          : evaluate(modules.get(target.file)?.bindings.get(target.name), module, environment);
      } else {
        values = module.reexports.flatMap((source) => readExport(source, name, environment));
      }
      activeExports.delete(key);
      return values;
    };

    const readProperty = (
      values: Values,
      name: string | undefined,
      environment: Environment
    ): Values =>
      values.flatMap((value) => {
        if (value.kind === 'object') {
          return name === undefined
            ? [...value.properties.values()].flat()
            : value.properties.get(name) || [];
        }
        if (value.kind === 'namespace') {
          return name === undefined ? [] : readExport(value.file, name, environment);
        }
        return [];
      });

    const readArray = (values: Values): Values[] => {
      const positions: Values[] = [];
      for (const value of values) {
        if (value.kind === 'object') {
          for (const [name, values] of value.properties) {
            const index = Number(name);
            if (Number.isInteger(index) && index >= 0) {
              (positions[index] ||= []).push(...values);
            }
          }
        }
      }
      return positions;
    };

    const bind = (node: Node, values: Values, module: Module, environment: Environment): void => {
      if (node.type === 'Identifier') {
        environment.set(node, values);
      } else if (node.type === 'AssignmentPattern') {
        bind(
          node.left,
          values.length ? values : evaluate(node.right, module, environment),
          module,
          environment
        );
      } else if (node.type === 'ObjectPattern') {
        for (const property of node.properties) {
          if (property.type === 'Property') {
            bind(
              property.value,
              readProperty(values, propertyName(property.key), environment),
              module,
              environment
            );
          }
        }
      } else if (node.type === 'ArrayPattern') {
        node.elements.forEach((element, index) => {
          if (element) {
            bind(element, readProperty(values, String(index), environment), module, environment);
          }
        });
      }
    };

    const invoke = (values: Values, args: Values[]): Values =>
      values.flatMap((value) => {
        if (value.kind === 'qrl') {
          dependencies.add(value.symbol);
          const previousCaptures = captures;
          captures = value.captures || [];
          const returned = invoke(
            readExport(manifest.mapping[value.symbol], value.symbol, new Map()),
            args
          );
          captures = previousCaptures;
          return returned;
        }
        if (value.kind !== 'function' || activeFunctions.has(value.node)) {
          return [];
        }
        activeFunctions.add(value.node);
        const environment = new Map(value.environment);
        value.node.params.forEach((parameter, index) => {
          if (parameter.type === 'RestElement') {
            bind(
              parameter.argument,
              [
                {
                  kind: 'object',
                  properties: new Map(
                    args.slice(index).map((values, index) => [String(index), values])
                  ),
                },
              ],
              value.module,
              environment
            );
          } else {
            bind(parameter, args[index] || [], value.module, environment);
          }
        });
        const returned = evaluate(value.node.body, value.module, environment);
        activeFunctions.delete(value.node);
        return returned;
      });

    const evaluate = (
      node: Node | null | undefined,
      module: Module,
      environment: Environment
    ): Values => {
      if (!node) {
        return [];
      }
      switch (node.type) {
        case 'Identifier': {
          const declaration = module.references.get(node);
          if (!declaration) {
            return [];
          }
          const cached = environment.get(declaration.node);
          if (cached) {
            return cached;
          }
          if (declaration.type === 'Import') {
            const file = resolveFile(module.file, declaration.importNode.source.value);
            const specifier = declaration.node;
            if (specifier.type === 'ImportNamespaceSpecifier') {
              return [{ kind: 'namespace', file }];
            }
            return readExport(
              file,
              specifier.type === 'ImportSpecifier' ? propertyName(specifier.imported)! : 'default',
              environment
            );
          }
          if (declaration.type === 'Function') {
            return evaluate(declaration.node, module, environment);
          }
          if (declaration.type === 'Variable') {
            environment.set(declaration.node, []);
            const binding = declaration.variableNode.declarations.find(
              ({ id }) => id.start <= declaration.node.start && id.end >= declaration.node.end
            );
            if (binding) {
              bind(binding.id, evaluate(binding.init, module, environment), module, environment);
            }
            return environment.get(declaration.node) || [];
          }
          return [];
        }
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
          return [{ kind: 'function', node, module, environment }];
        case 'Program':
        case 'BlockStatement':
          return node.body.flatMap((statement) =>
            statement.type === 'FunctionDeclaration' ? [] : evaluate(statement, module, environment)
          );
        case 'ReturnStatement':
          return evaluate(node.argument, module, environment);
        case 'ExpressionStatement':
          evaluate(node.expression, module, environment);
          return [];
        case 'VariableDeclaration':
          for (const declaration of node.declarations) {
            bind(
              declaration.id,
              evaluate(declaration.init, module, environment),
              module,
              environment
            );
          }
          return [];
        case 'CallExpression': {
          const target = node.arguments[1];
          const symbol =
            target?.type === 'Literal' && typeof target.value === 'string'
              ? target.value
              : target?.type === 'TemplateLiteral' && !target.expressions.length
                ? target.quasis[0].value.cooked
                : undefined;
          if (
            node.arguments[0]?.type === 'ArrowFunctionExpression' &&
            symbol &&
            manifest.symbols[symbol]
          ) {
            return [{ kind: 'qrl', symbol }];
          }
          const args = node.arguments.flatMap((argument) =>
            argument.type === 'SpreadElement'
              ? readArray(evaluate(argument.argument, module, environment))
              : [evaluate(argument, module, environment)]
          );
          let callbackValues: Values = [];
          if (node.callee.type === 'MemberExpression') {
            const receiver = evaluate(node.callee.object, module, environment);
            callbackValues = readProperty(receiver, undefined, environment);
            const method = propertyName(node.callee.property);
            if (method === 'call' || method === 'apply') {
              return invoke(receiver, method === 'call' ? args.slice(1) : readArray(args[1] || []));
            }
            const qrls = receiver.filter((value) => value.kind === 'qrl');
            if (qrls.length) {
              const hasCaptures = args[0]?.some((value) => value.kind === 'object');
              return qrls.map((value) => ({
                ...value,
                captures: hasCaptures ? readArray(args[0]) : value.captures,
              }));
            }
          }
          const callee = evaluate(node.callee, module, environment);
          if (callee.length) {
            return invoke(callee, args);
          }
          // Unknown consumers may execute callbacks passed in their first argument.
          invoke(args[0]?.filter((value) => value.kind === 'function') || [], [callbackValues]);
          const qrls = args[0]?.filter((value) => value.kind === 'qrl') || [];
          for (const value of qrls) {
            const symbol = manifest.symbols[value.symbol];
            if (!isStrippedSegment(symbol.ctxName, symbol.ctxKind, CLIENT_STRIP_CTX_NAME, true)) {
              invoke([value], []);
            }
          }
          return qrls;
        }
        case 'MemberExpression': {
          const values = readProperty(
            evaluate(node.object, module, environment),
            node.computed
              ? node.property.type === 'Literal'
                ? propertyName(node.property)
                : undefined
              : propertyName(node.property),
            environment
          );
          if (
            values.length ||
            !node.computed ||
            node.property.type !== 'Literal' ||
            typeof node.property.value !== 'number'
          ) {
            return values;
          }
          const holder = node.object.type === 'MemberExpression' ? node.object.object : node.object;
          if (holder.type !== 'Identifier') {
            return [];
          }
          const declaration = module.references.get(holder);
          if (declaration?.type !== 'Import') {
            return [];
          }
          const source = declaration.importNode.source.value;
          if (
            resolveFile(module.file, source) === manifest.core ||
            /^@qwik\.dev\/core(?:\/|$)/.test(source)
          ) {
            return captures[node.property.value] || [];
          }
          return [];
        }
        case 'ObjectExpression': {
          const properties = new Map<string, Values>();
          for (const property of node.properties) {
            if (property.type === 'Property') {
              properties.set(
                propertyName(property.key)!,
                evaluate(property.value, module, environment)
              );
            } else {
              for (const value of evaluate(property.argument, module, environment)) {
                if (value.kind === 'object') {
                  value.properties.forEach((values, name) => properties.set(name, values));
                }
              }
            }
          }
          return [{ kind: 'object', properties }];
        }
        case 'ArrayExpression':
          return [
            {
              kind: 'object',
              properties: new Map(
                node.elements.map((element, index) => [
                  String(index),
                  evaluate(element, module, environment),
                ])
              ),
            },
          ];
        case 'AwaitExpression':
        case 'ChainExpression':
          return evaluate(
            node.type === 'AwaitExpression' ? node.argument : node.expression,
            module,
            environment
          );
        case 'LogicalExpression':
          return [
            ...evaluate(node.left, module, environment),
            ...evaluate(node.right, module, environment),
          ];
        case 'ConditionalExpression':
        case 'IfStatement':
          evaluate(node.test, module, environment);
          return [
            ...evaluate(node.consequent, module, environment),
            ...evaluate(node.alternate, module, environment),
          ];
        case 'SequenceExpression':
          return node.expressions.flatMap((expression) =>
            evaluate(expression, module, environment)
          );
        case 'AssignmentExpression': {
          const values = evaluate(node.right, module, environment);
          if (node.left.type === 'Identifier') {
            environment.set(module.references.get(node.left)?.node || node.left, values);
          }
          return values;
        }
        default:
          walk(node, {
            enter(child) {
              if (child !== node) {
                evaluate(child, module, environment);
                this.skip();
              }
            },
          });
          return [];
      }
    };

    invoke(readExport(file, symbol, new Map()), []);
    dependencies.delete(symbol);
    result.set(symbol, [...dependencies]);
  }
  return result;
}
