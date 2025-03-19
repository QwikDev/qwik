import * as ESLintUtils from '@typescript-eslint/utils/eslint-utils';
import ts from 'typescript';
import type { Identifier } from 'estree';
import redent from 'redent';
import type { RuleContext, Scope } from '@typescript-eslint/utils/dist/ts-eslint';
import { QwikEslintExamples } from '../examples';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://qwik.dev/docs/advanced/eslint/#${name}`
);

interface DetectorOptions {
  allowAny: boolean;
}
export const validLexicalScope = createRule({
  name: 'valid-lexical-scope',
  defaultOptions: [
    {
      allowAny: true,
    },
  ],
  meta: {
    type: 'problem',
    docs: {
      description:
        'Used the tsc typechecker to detect the capture of unserializable data in dollar ($) scopes.',
      recommended: 'recommended',
    },

    schema: [
      {
        type: 'object',
        properties: {
          allowAny: {
            type: 'boolean',
          },
        },
        default: {
          allowAny: true,
        },
      },
    ],

    messages: {
      referencesOutside:
        'When referencing "{{varName}}" inside a different scope ({{dollarName}}), Qwik needs to serialize the value, however {{reason}}.\nCheck out https://qwik.dev/docs/advanced/dollar/ for more details.',
      invalidJsxDollar:
        'Using "{{varName}}" as an event handler, however functions are not serializable.\nDid you mean to wrap it in `$()`?\n\n{{solution}}\nCheck out https://qwik.dev/docs/advanced/dollar/ for more details.',
      mutableIdentifier:
        'Mutating let "{{varName}}" within the ({{dollarName}}) closure is not allowed, instead create an object/store/signal and mutate one of its properties.\nCheck out https://qwik.dev/docs/advanced/dollar/ for more details.',
    },
  },
  create(context) {
    const allowAny = context.options[0]?.allowAny ?? true;
    const opts: DetectorOptions = {
      allowAny,
    };
    const scopeManager = context.sourceCode.scopeManager!;
    const services = ESLintUtils.getParserServices(context);
    const esTreeNodeToTSNodeMap = services.esTreeNodeToTSNodeMap;
    const typeChecker = services.program.getTypeChecker();
    const relevantScopes: Map<any, string> = new Map();
    let exports: ts.Symbol[] = [];

    function walkScope(scope: Scope.Scope) {
      scope.references.forEach((ref) => {
        const declaredVariable = ref.resolved;
        const declaredScope = ref.resolved?.scope as Scope.Scope;
        if (declaredVariable && declaredScope) {
          const variableType = declaredVariable.defs.at(0)?.type;
          if (variableType === 'Type') {
            return;
          }
          if (variableType === 'ImportBinding') {
            return;
          }

          if (isQwikHook(declaredVariable, context)) {
            return;
          }

          let dollarScope: Scope.Scope | null = ref.from;
          let dollarIdentifier: string | undefined;
          while (dollarScope) {
            dollarIdentifier = relevantScopes.get(dollarScope);
            if (dollarIdentifier) {
              break;
            }
            dollarScope = dollarScope.upper;
          }
          if (dollarScope && dollarIdentifier) {
            // Variable used inside $
            const scopeType = declaredScope.type;
            if (scopeType === 'global') {
              return;
            }
            if (scopeType === 'module') {
              return;
            }
            const identifier = ref.identifier;
            const tsNode = esTreeNodeToTSNodeMap.get(identifier);
            let ownerDeclared: Scope.Scope | null = declaredScope;
            while (ownerDeclared) {
              if (relevantScopes.has(ownerDeclared)) {
                break;
              }
              ownerDeclared = ownerDeclared.upper;
            }

            if (ownerDeclared !== dollarScope) {
              if (identifier.parent && identifier.parent.type === 'AssignmentExpression') {
                if (identifier.parent.left === identifier) {
                  context.report({
                    messageId: 'mutableIdentifier',
                    node: ref.identifier,
                    data: {
                      varName: ref.identifier.name,
                      dollarName: dollarIdentifier,
                    },
                  });
                }
              }

              const reason = canCapture(context, typeChecker, tsNode, ref.identifier, opts);
              if (reason) {
                context.report({
                  messageId: 'referencesOutside',
                  node: ref.identifier,
                  data: {
                    varName: ref.identifier.name,
                    dollarName: dollarIdentifier,
                    reason: humanizeTypeReason(reason),
                  },
                });
              }
            }
          }
        }
      });
      scope.childScopes.forEach(walkScope);
    }

    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier') {
          if (node.callee.name.endsWith('$')) {
            const firstArg = node.arguments.at(0);
            if (firstArg && firstArg.type === 'ArrowFunctionExpression') {
              const scope = scopeManager.acquire(firstArg);
              if (scope) {
                relevantScopes.set(scope, node.callee.name);
              }
            }
          }
        }
      },
      JSXAttribute(node) {
        const jsxName = node.name;
        const name = jsxName.type === 'JSXIdentifier' ? jsxName.name : jsxName.name.name;

        if (name.endsWith('$')) {
          const firstArg = node.value;
          if (firstArg && firstArg.type === 'JSXExpressionContainer') {
            const scope = scopeManager.acquire(firstArg.expression);
            if (scope) {
              relevantScopes.set(scope, name);
            } else if (firstArg.expression.type === 'Identifier') {
              const tsNode = esTreeNodeToTSNodeMap.get(firstArg.expression);
              const type = typeChecker.getTypeAtLocation(tsNode).getNonNullableType();

              if (!isTypeQRL(type)) {
                if (type.isUnionOrIntersection()) {
                  if (
                    !type.types.every((t) => {
                      if (t.symbol) {
                        return t.symbol.name === 'Component' || t.symbol.name === 'PropFnInterface';
                      }
                      return false;
                    })
                  ) {
                    context.report({
                      messageId: 'invalidJsxDollar',
                      node: firstArg.expression,
                      data: {
                        varName: firstArg.expression.name,
                        solution: `Fix the type of ${firstArg.expression.name} to be QRL`,
                      },
                    });
                  }
                } else {
                  const symbolName = type.symbol?.name;
                  if (symbolName === 'PropFnInterface') {
                    return;
                  }
                  context.report({
                    messageId: 'invalidJsxDollar',
                    node: firstArg.expression,
                    data: {
                      varName: firstArg.expression.name,
                      solution: `const ${firstArg.expression.name} = $(\n${getContent(
                        type.symbol,
                        context.sourceCode.text
                      )}\n);\n`,
                    },
                  });
                }
              }
            }
          }
        }
      },
      Program(node) {
        const module = esTreeNodeToTSNodeMap.get(node);
        const moduleSymbol = typeChecker.getSymbolAtLocation(module);

        /**
         * Despite what the type signature says, {@link typeChecker.getSymbolAtLocation} can return
         * undefined for empty modules. This happens, for example, when creating a brand new file.
         */
        if (moduleSymbol) {
          exports = typeChecker.getExportsOfModule(moduleSymbol);
        }
      },
      'Program:exit'() {
        walkScope(scopeManager.globalScope! as any);
      },
    };
  },
});

function canCapture(
  context: RuleContext<any, any>,
  checker: ts.TypeChecker,
  node: ts.Node,
  ident: Identifier,
  opts: DetectorOptions
) {
  const type = checker.getTypeAtLocation(node);
  const seen = new Set<any>();
  return isTypeCapturable(context, checker, type, node, ident, opts, seen);
}

interface TypeReason {
  type: ts.Type;
  typeStr: string;
  location?: string;
  reason: string;
}

function humanizeTypeReason(reason: TypeReason) {
  let message = '';
  if (reason.location) {
    message += `"${reason.location}" `;
  } else {
    message += 'it ';
  }
  message += `${reason.reason}`;
  return message;
}

function isTypeCapturable(
  context: RuleContext<any, any>,
  checker: ts.TypeChecker,
  type: ts.Type,
  tsnode: ts.Node,
  ident: Identifier,
  opts: DetectorOptions,
  seen: Set<any>
): TypeReason | undefined {
  const result = _isTypeCapturable(context, checker, type, tsnode, opts, 0, seen);
  if (result) {
    const loc = result.location;
    if (loc) {
      result.location = `${ident.name}.${loc}`;
    }
    return result;
  }
  return result;
}
function _isTypeCapturable(
  context: RuleContext<any, any>,
  checker: ts.TypeChecker,
  type: ts.Type,
  node: ts.Node,
  opts: DetectorOptions,
  level: number,
  seen: Set<any>
): TypeReason | undefined {
  // NoSerialize is ok
  if (seen.has(type)) {
    return;
  }
  seen.add(type);
  if (type.getProperty('__no_serialize__') || type.getProperty('__qwik_serializable__')) {
    return;
  }
  const isUnknown = type.flags & ts.TypeFlags.Unknown;
  if (isUnknown) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is unknown, which could be serializable or not, please make the type more specific',
    };
  }
  const isAny = type.flags & ts.TypeFlags.Any;
  if (!opts.allowAny && isAny) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is any, which is not serializable',
    };
  }
  const isSymbol = type.flags & ts.TypeFlags.ESSymbolLike;
  if (isSymbol) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is Symbol, which is not serializable',
    };
  }
  const isEnum = type.flags & ts.TypeFlags.Enum;
  if (isEnum) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is an enum, use an string or a number instead',
    };
  }
  if (isTypeQRL(type)) {
    return;
  }
  if (type.symbol?.name === 'JSXNode') {
    return;
  }

  const canBeCalled = type.getCallSignatures().length > 0;
  if (canBeCalled) {
    const symbolName = type.symbol.name;
    if (
      symbolName === 'PropFnInterface' ||
      symbolName === 'RefFnInterface' ||
      symbolName === 'bivarianceHack' ||
      symbolName === 'FunctionComponent'
    ) {
      return;
    }
    let reason = 'is a function, which is not serializable';
    if (level === 0 && ts.isIdentifier(node)) {
      const solution = `const ${node.text} = $(\n${getContent(
        type.symbol,
        context.sourceCode.text
      )}\n);`;
      reason += `.\nDid you mean to wrap it in \`$()\`?\n\n${solution}\n`;
    }

    return {
      type,
      typeStr: checker.typeToString(type),
      reason,
    };
  }

  if (type.isUnion()) {
    for (const subType of type.types) {
      const result = _isTypeCapturable(context, checker, subType, node, opts, level + 1, seen);
      if (result) {
        return result;
      }
    }
    return;
  }
  const isObject = (type.flags & ts.TypeFlags.Object) !== 0;
  if (isObject) {
    const arrayType = getElementTypeOfArrayType(type, checker);
    if (arrayType) {
      return _isTypeCapturable(context, checker, arrayType, node, opts, level + 1, seen);
    }

    const tupleTypes = getTypesOfTupleType(type, checker);
    if (tupleTypes) {
      for (const subType of tupleTypes) {
        const result = _isTypeCapturable(context, checker, subType, node, opts, level + 1, seen);
        if (result) {
          return result;
        }
      }
      return;
    }

    const symbolName = type.symbol.name;

    // Element is ok
    if (type.getProperty('nextElementSibling')) {
      return;
    }
    // Document is ok
    if (type.getProperty('activeElement')) {
      return;
    }
    if (symbolName in ALLOWED_CLASSES) {
      return;
    }
    if (type.isClass()) {
      return {
        type,
        typeStr: checker.typeToString(type),
        reason: `is an instance of the "${type.symbol.name}" class, which is not serializable. Use a simple object literal instead`,
      };
    }

    const prototype = type.getProperty('prototype');
    if (prototype) {
      const type = checker.getTypeOfSymbolAtLocation(prototype, node);
      if (type.isClass()) {
        return {
          type,
          typeStr: checker.typeToString(type),
          reason: 'is a class constructor, which is not serializable',
        };
      }
    }

    if (!symbolName.startsWith('__') && type.symbol.valueDeclaration) {
      return {
        type,
        typeStr: checker.typeToString(type),
        reason: `is an instance of the "${type.symbol.name}" class, which is not serializable`,
      };
    }

    for (const symbol of type.getProperties()) {
      const result = isSymbolCapturable(context, checker, symbol, node, opts, level + 1, seen);
      if (result) {
        const loc = result.location;
        result.location = `${symbol.name}${loc ? `.${loc}` : ''}`;
        return result;
      }
    }
  }
  return;
}

function isSymbolCapturable(
  context: RuleContext<any, any>,
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  node: ts.Node,
  opts: DetectorOptions,
  level: number,
  seen: Set<any>
) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, node);
  return _isTypeCapturable(context, checker, type, node, opts, level, seen);
}

function getElementTypeOfArrayType(type: ts.Type, checker: ts.TypeChecker): ts.Type | undefined {
  return (checker as any).getElementTypeOfArrayType(type);
}

function getTypesOfTupleType(
  type: ts.Type,
  checker: ts.TypeChecker
): readonly ts.Type[] | undefined {
  return (checker as any).isTupleType(type)
    ? checker.getTypeArguments(type as ts.TupleType)
    : undefined;
}

function isTypeQRL(type: ts.Type): boolean {
  return (
    !!(type.flags & ts.TypeFlags.Any) || !!type.getNonNullableType().getProperty('__brand__QRL__')
  );
}

function getContent(symbol: ts.Symbol, sourceCode: string) {
  if (symbol && symbol.declarations && symbol.declarations.length > 0) {
    const decl = symbol.declarations[0];
    // Remove empty lines
    const text = sourceCode.slice(decl.pos, decl.end).replace(/^\s*$/gm, '');
    return redent(text, 2);
  }
  return '';
}

function isQwikHook(variable, context) {
  const def = variable.defs[0];
  if (!def || def.type !== 'Variable') {
    return false;
  }

  const init = def.node.init;
  if (
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    /^use[A-Z]/.test(init.callee.name)
  ) {
    const hookName = init.callee.name;
    const scope = context.sourceCode.getScope(def.node);
    const ref = scope.references.find((r) => r.identifier.name === hookName);

    return ref?.resolved && isFromQwikModule(ref.resolved, context);
  }
  return false;
}

function isFromQwikModule(resolvedVar) {
  return resolvedVar.defs.some((def) => {
    if (def.type !== 'ImportBinding') {
      return false;
    }
    const importSource = def.parent.source.value;

    return (
      importSource.startsWith('@builder.io/qwik') ||
      importSource.startsWith('@builder.io/qwik-city')
    );
  });
}

const ALLOWED_CLASSES = {
  Promise: true,
  URL: true,
  RegExp: true,
  Date: true,
  FormData: true,
  URLSearchParams: true,
  Error: true,
  Set: true,
  Map: true,
  Uint8Array: true,
};

const referencesOutsideGood = `
import { component$, useTask$, $ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  const print = $((msg: string) => {
    console.log(msg);
  });

  useTask$(() => {
    print("Hello World");
  });

  return <h1>Hello</h1>;
});`.trim();

const referencesOutsideBad = `
import { component$, useTask$ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  const print = (msg: string) => {
    console.log(msg);
  };

  useTask$(() => {
    print("Hello World");
  });

  return <h1>Hello</h1>;
});`.trim();

const invalidJsxDollarGood = `
import { component$, $ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  const click = $(() => console.log());
  return (
    <button onClick$={click}>log it</button>
  );
});`.trim();

const invalidJsxDollarBad = `
import { component$ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  const click = () => console.log();
  return (
    <button onClick$={click}>log it</button>
  );
});`.trim();

const mutableIdentifierGood = `
import { component$ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  const person = { name: 'Bob' };

  return (
    <button onClick$={() => {
      person.name = 'Alice';
    }}>
      {person.name}
    </button>
  );
});`.trim();

const mutableIdentifierBad = `
import { component$ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  let personName = 'Bob';

  return (
    <button onClick$={() => {
      personName = 'Alice';
    }}>
      {personName}
    </button>
  );
});`.trim();

export const validLexicalScopeExamples: QwikEslintExamples = {
  referencesOutside: {
    good: [
      {
        codeHighlight: `{1,4} /print/#a /$((msg: string)/#b)`,
        code: referencesOutsideGood,
      },
    ],
    bad: [
      {
        codeHighlight: `{1,4} /print/#a /(msg: string)/#b)`,
        code: referencesOutsideBad,
        description:
          'Since Expressions are not serializable, they must be wrapped with `$( ... )` so that the optimizer can split the code into small chunks.',
      },
    ],
  },
  invalidJsxDollar: {
    good: [
      {
        codeHighlight: '{1} /click/#a',
        code: invalidJsxDollarGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{1} /click/#a',
        code: invalidJsxDollarBad,
        description: 'Event handler must be wrapped with `${ ... }`.',
      },
    ],
  },
  mutableIdentifier: {
    good: [
      {
        codeHighlight: '{4} /person/#a',
        code: mutableIdentifierGood,
      },
    ],
    bad: [
      {
        codeHighlight: '{4} /personName/#a',
        code: mutableIdentifierBad,
        description:
          'Simple values are not allowed to be mutated. Use an Object instead and edit one of its property.',
      },
    ],
  },
};
