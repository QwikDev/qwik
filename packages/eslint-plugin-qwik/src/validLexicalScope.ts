/* eslint-disable no-console */
import { ESLintUtils } from '@typescript-eslint/utils';
import type { Scope } from '@typescript-eslint/utils/dist/ts-eslint-scope';
import ts from 'typescript';
import type { Identifier } from 'estree';

const createRule = ESLintUtils.RuleCreator((name) => `https://typescript-eslint.io/rules/${name}`);

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
      recommended: 'error',
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
        'Identifier ("{{varName}}") can not be captured inside the scope ({{dollarName}}) because {{reason}}. Check out https://qwik.builder.io/docs/advanced/dollar/ for more details.',
      unvalidJsxDollar:
        'JSX attributes that end with $ can only take an inlined arrow function of a QRL identifier. Make sure the value is created using $()',
      mutableIdentifier:
        'The value of the identifier ("{{varName}}") can not be changed once it is captured the scope ({{dollarName}}). Check out https://qwik.builder.io/docs/advanced/dollar/ for more details.',
    },
  },
  create(context) {
    const allowAny = context.options[0]?.allowAny ?? true;
    const opts: DetectorOptions = {
      allowAny,
    };
    const scopeManager = context.getSourceCode().scopeManager!;
    const services = ESLintUtils.getParserServices(context);
    const esTreeNodeToTSNodeMap = services.esTreeNodeToTSNodeMap;
    const typeChecker = services.program.getTypeChecker();
    const relevantScopes: Map<any, string> = new Map();
    let exports: ts.Symbol[] = [];

    function walkScope(scope: Scope) {
      scope.references.forEach((ref) => {
        const declaredVariable = ref.resolved;
        const declaredScope = ref.resolved?.scope;
        if (declaredVariable && declaredScope) {
          const variableType = declaredVariable.defs.at(0)?.type;
          if (variableType === 'Type') {
            return;
          }
          if (variableType === 'ImportBinding') {
            return;
          }
          let dollarScope: Scope | null = ref.from;
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
              const identifier =
                declaredVariable.identifiers.length === 1
                  ? declaredVariable.identifiers[0]
                  : ref.identifier;
              const tsNode = esTreeNodeToTSNodeMap.get(identifier);
              const s = typeChecker.getSymbolAtLocation(tsNode);
              if (s && exports.includes(s)) {
                return;
              }
              context.report({
                messageId: 'referencesOutside',
                node: ref.identifier,
                data: {
                  varName: ref.identifier.name,
                  dollarName: dollarIdentifier,
                  reason:
                    "it's declared at the root of the module and it is not exported. Add export",
                },
              });
              return;
            }
            const identifier = ref.identifier;
            const tsNode = esTreeNodeToTSNodeMap.get(identifier);
            let ownerDeclared: Scope | null = declaredScope;
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
              const reason = canCapture(typeChecker, tsNode, ref.identifier, opts);
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
              const type = typeChecker.getTypeAtLocation(tsNode);
              if (!isTypeQRL(type)) {
                context.report({
                  messageId: 'unvalidJsxDollar',
                  node: firstArg.expression,
                });
              }
            }
          }
        }
      },
      Program(node) {
        const module = esTreeNodeToTSNodeMap.get(node);
        const moduleSymbol = typeChecker.getSymbolAtLocation(module);

        /**
         * Despite what the type signature says,
         * {@link typeChecker.getSymbolAtLocation} can return undefined for
         * empty modules. This happens, for example, when creating a brand new
         * file.
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
  checker: ts.TypeChecker,
  node: ts.Node,
  ident: Identifier,
  opts: DetectorOptions
) {
  const type = checker.getTypeAtLocation(node);
  const seen = new Set<any>();
  return isTypeCapturable(checker, type, node, ident, opts, seen);
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
  checker: ts.TypeChecker,
  type: ts.Type,
  tsnode: ts.Node,
  ident: Identifier,
  opts: DetectorOptions,
  seen: Set<any>
): TypeReason | undefined {
  const result = _isTypeCapturable(checker, type, tsnode, opts, 0, seen);
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
  if (type.getProperty('__no_serialize__')) {
    return;
  }
  const isUnknown = type.flags & ts.TypeFlags.Unknown;
  if (isUnknown) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is unknown, which could be serializable or not, please make the type for specific',
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
  const isBigInt = type.flags & ts.TypeFlags.BigIntLike;
  if (isBigInt) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is BigInt and it is not supported yet, use a number instead',
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
  const isEnum = type.flags & ts.TypeFlags.EnumLike;
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

  const canBeCalled = type.getCallSignatures().length > 0;
  if (canBeCalled) {
    const symbolName = type.symbol.name;
    if (symbolName === 'PropFnInterface') {
      return;
    }
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is a function, which is not serializable',
    };
  }

  if (type.isUnion()) {
    for (const subType of type.types) {
      const result = _isTypeCapturable(checker, subType, node, opts, level + 1, seen);
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
      return _isTypeCapturable(checker, arrayType, node, opts, level + 1, seen);
    }

    const tupleTypes = getTypesOfTupleType(type, checker);
    if (tupleTypes) {
      for (const subType of tupleTypes) {
        const result = _isTypeCapturable(checker, subType, node, opts, level + 1, seen);
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
    if (ALLOWED_CLASSES[symbolName]) {
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
      const result = isSymbolCapturable(checker, symbol, node, opts, level + 1, seen);
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
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  node: ts.Node,
  opts: DetectorOptions,
  level: number,
  seen: Set<any>
) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, node);
  return _isTypeCapturable(checker, type, node, opts, level, seen);
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
  return !!(type.flags & ts.TypeFlags.Any) || !!type.getProperty('__brand__QRL__');
}

const ALLOWED_CLASSES = {
  Promise: true,
  URL: true,
  RegExp: true,
  Date: true,
  FormData: true,
  URLSearchParams: true,
  Error: true,
};
