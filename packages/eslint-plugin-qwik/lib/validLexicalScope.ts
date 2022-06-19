/* eslint-disable no-console */
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { Scope } from '@typescript-eslint/utils/dist/ts-eslint-scope';
import ts, { TypeChecker, Node, TypeFlags } from 'typescript';
import type { Identifier } from 'estree'

const createRule = ESLintUtils.RuleCreator((name) => `https://typescript-eslint.io/rules/${name}`);

export const validLexicalScope = createRule({
  name: 'valid-lexical-scope',
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: {
      description: 'jh$',
      recommended: 'error',
    },
    schema: [],
    messages: {
      referencesOutside: 'Identifier ("{{varName}}") can not be captured inside the scope ({{dollarName}}) because {{reason}}. Check out https://qwik.builder.io/docs/advanced/optimizer for more details.',
    },
  },
  create(context) {
    const scopeManager = context.getSourceCode().scopeManager!;
    const services = ESLintUtils.getParserServices(context);
    const esTreeNodeToTSNodeMap = services.esTreeNodeToTSNodeMap;
    const typeChecker = services.program.getTypeChecker();
    const relevantScopes: Map<any, Identifier> = new Map();
    let exports: ts.Symbol[] = [];

    function walkScope(scope: Scope) {
      scope.references.forEach((ref) => {
        const declaredVariable = ref.resolved;
        const declaredScope = ref.resolved?.scope;
        if (declaredVariable && declaredScope) {
          let dollarScope: Scope | null = ref.from;
          let dollarIdentifier: Identifier | undefined;
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
            const tsNode = esTreeNodeToTSNodeMap.get(ref.identifier);
            if (scopeType === 'module') {
              const imported = declaredVariable.defs.at(0)?.type == 'ImportBinding';
              if (imported) {
                return;
              }
              const s = typeChecker.getSymbolAtLocation(tsNode);
              if (s && exports.includes(s)) {
                return;
              }
              context.report({
                messageId: 'referencesOutside',
                node: ref.identifier,
                data: {
                  varName: ref.identifier.name,
                  dollarName: dollarIdentifier.name,
                  reason: "it's declared at the root of the module and it is not exported. Add export"
                },
              });
              return;
            }
            let ownerDeclared: Scope | null = declaredScope;
            while (ownerDeclared) {
              if (relevantScopes.has(ownerDeclared)) {
                break;
              }
              ownerDeclared = ownerDeclared.upper;
            }

            if (ownerDeclared !== dollarScope) {
              const reason = canCapture(typeChecker, tsNode, ref.identifier);
              if (reason) {
                context.report({
                  messageId: 'referencesOutside',
                  node: ref.identifier,
                  data: {
                    varName: ref.identifier.name,
                    dollarName: dollarIdentifier.name,
                    reason: humanizeTypeReason(reason)
                  }
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
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          if (node.callee.name.endsWith('$')) {
            const firstArg = node.arguments.at(0);
            if (firstArg && firstArg.type === AST_NODE_TYPES.ArrowFunctionExpression) {
              const scope = scopeManager.acquire(firstArg);
              if (scope) {
                relevantScopes.set(scope, node.callee);
              }
            }
          }
        }
      },
      Program(node) {
        const module = esTreeNodeToTSNodeMap.get(node);
        exports = typeChecker.getExportsOfModule(typeChecker.getSymbolAtLocation(module)!);
      },
      'Program:exit'() {
        walkScope(scopeManager.globalScope! as any);
      },
    };
  },
});

function canCapture(checker: TypeChecker, node: Node, ident: Identifier) {
  const type = checker.getTypeAtLocation(node);

  // const typeStr = checker.typeToString(
  //   type,
  //   node
  // );
  return isTypeCapturable(checker, type, node, ident);
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
  message += `${reason.reason}, which is not serializable`;
  return message;
}

function isTypeCapturable(checker: TypeChecker, type: ts.Type, tsnode: Node, ident: Identifier): TypeReason | undefined {
  const result = _isTypeCapturable(checker, type, tsnode, 0);
  if (result) {
    const loc = result.location;
    if (loc) {
      result.location = `${ident.name}.${loc}`;
    }
    return result;
  }
  return result;
}
function _isTypeCapturable(checker: TypeChecker, type: ts.Type, node: Node, level: number): TypeReason | undefined {
  const isUnknown = type.flags & TypeFlags.Unknown;
  if (isUnknown) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is unknown'
    };
  }
  const isBigInt = type.flags & TypeFlags.BigIntLike;
  if (isBigInt) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is BigInt and it is not supported yet, use a number instead'
    };
  }
  const isEnum = type.flags & TypeFlags.EnumLike;
  if (isEnum) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is an enum, use an string or a number instead'
    };
  }
  const canBeCalled = type.getCallSignatures().length > 0;
  if (canBeCalled) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is a function'
    };
  }
  if (type.isClass()) {
    return {
      type,
      typeStr: checker.typeToString(type),
      reason: 'is a Class{}, use a simple object literal instead'
    };
  }
  const isObject = (type.flags & TypeFlags.Object) !== 0;
  if (isObject) {
    // NoSerialize is ok
    if (type.getProperty('__no_serialize__')) {
      return;
    }
    // Element is ok
    if (type.getProperty('nextElementSibling')) {
      return;
    }
    // Document is ok
    if (type.getProperty('activeElement')) {
      return;
    }
    // QRL is ok
    if (type.getProperty('__brand__QRL__')) {
      return;
    }

    for (const symbol of type.getProperties()) {
      const result = isSymbolCapturable(checker, symbol, node, level + 1);
      if (result) {
        const loc = result.location;
        result.location = `${symbol.name}${loc ? `.${loc}` : ''}`;
        return result;
      }
    }
  }
  return;
}

function isSymbolCapturable(checker: TypeChecker, symbol: ts.Symbol, node: Node, level: number) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, node);
  return _isTypeCapturable(checker, type, node, level);
}
