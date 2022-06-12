/* eslint-disable no-console */
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { Scope } from '@typescript-eslint/utils/dist/ts-eslint-scope';
import ts, { Node, TypeChecker, TypeFlags } from 'typescript';

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
      referencesOutside: 'Referenced invalid identifier',
    },
  },
  create(context) {
    const scopeManager = context.getSourceCode().scopeManager!;
    const services = ESLintUtils.getParserServices(context);
    const esTreeNodeToTSNodeMap = services.esTreeNodeToTSNodeMap;
    const typeChecker = services.program.getTypeChecker();
    const relevantScopes: Set<any> = new Set();
    let exports: ts.Symbol[] = [];
    function walkScope(scope: Scope) {
      scope.references.forEach((ref) => {
        const declaredScope = ref.resolved?.scope;
        const scopeType = declaredScope?.type;
        if (scopeType === 'global') {
          return;
        }
        const tsNode = esTreeNodeToTSNodeMap.get(ref.identifier);

        if (scopeType === 'module') {
          const imported = ref.resolved?.defs.at(0)?.type == 'ImportBinding';
          if (imported) {
            return;
          }
          const s = typeChecker.getSymbolAtLocation(tsNode);
          if (s && exports.includes(s)) {
            return;
          }
        }
        if (declaredScope) {
          let ownerDeclared: Scope | null = declaredScope;
          while (ownerDeclared) {
            if (relevantScopes.has(ownerDeclared)) {
              break;
            }
            ownerDeclared = ownerDeclared.upper;
          }

          let ownerUsed: Scope | null = ref.from;
          while (ownerUsed) {
            if (relevantScopes.has(ownerUsed)) {
              break;
            }
            ownerUsed = ownerUsed.upper;
          }
          if (ownerDeclared !== ownerUsed) {
            if (!canCapture(typeChecker, tsNode)) {
              context.report({
                messageId: 'referencesOutside',
                node: ref.identifier,
              });
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
                relevantScopes.add(scope);
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

function canCapture(checker: TypeChecker, node: Node) {
  const type = checker.getTypeAtLocation(node);

  // const typeStr = checker.typeToString(
  //   type,
  //   node
  // );
  return isTypeCapturable(checker, type, node);
}

function isTypeCapturable(checker: TypeChecker, type: ts.Type, node: Node) {
  const notCapture = type.flags & (TypeFlags.Unknown | TypeFlags.BigIntLike | TypeFlags.EnumLike);
  if (notCapture) {
    return false;
  }
  const canBeCalled = type.getCallSignatures().length > 0;
  if (canBeCalled) {
    return false;
  }
  if (type.isClass()) {
    return false;
  }
  const isObject = (type.flags & TypeFlags.Object) !== 0;
  if (isObject) {
    // NoSerialize is ok
    if (type.getProperty('__no_serialize__')) {
      return true;
    }
    // Element is ok
    if (type.getProperty('nextElementSibling')) {
      return true;
    }
    // Document is ok
    if (type.getProperty('activeElement')) {
      return true;
    }
    // QRL is ok
    if (type.getProperty('__brand__QRL__')) {
      return true;
    }

    for (const symbol of type.getProperties()) {
      if (!isSymbolCapturable(checker, symbol, node)) {
        return false;
      }
    }
  }
  return true;
}

function isSymbolCapturable(checker: TypeChecker, symbol: ts.Symbol, node: Node) {
  const type = checker.getTypeOfSymbolAtLocation(symbol, node);
  return isTypeCapturable(checker, type, node);
}
