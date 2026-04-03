const ALLOWED_TYPE_NAMES = new Set(['Map', 'Set', 'ReadonlyMap', 'ReadonlySet']);
const ALLOWED_METHOD_NAMES = new Set(['entries', 'values']);

const getPropertyName = (memberExpression) => {
  if (memberExpression.computed) {
    return null;
  }
  return memberExpression.property.type === 'Identifier' ? memberExpression.property.name : null;
};

const hasAllowedIteratorMethod = (node) =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  ALLOWED_METHOD_NAMES.has(getPropertyName(node.callee) || '');

const isAllowedType = (checker, type, seen = new Set()) => {
  if (!type || seen.has(type)) {
    return false;
  }
  seen.add(type);

  if ('types' in type && Array.isArray(type.types) && type.types.length > 0) {
    return type.types.every((memberType) => isAllowedType(checker, memberType, seen));
  }

  const symbol = type.getSymbol?.() ?? type.aliasSymbol;
  const name = symbol?.getName();
  if (name && ALLOWED_TYPE_NAMES.has(name)) {
    return true;
  }

  const baseTypes = type.getBaseTypes?.() ?? [];
  for (let i = 0; i < baseTypes.length; i++) {
    if (isAllowedType(checker, baseTypes[i], seen)) {
      return true;
    }
  }

  const apparentType = checker.getApparentType(type);
  if (apparentType && apparentType !== type) {
    return isAllowedType(checker, apparentType, seen);
  }

  return false;
};

export const qwikLoopStyleRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer classic indexed loops or while loops in packages/qwik/src, while allowing Map/Set iteration and entries()/values() iterators.',
    },
    messages: {
      noForEach:
        'Use a classic for-loop, while-loop, or an allowed for-of iterator instead of .forEach() in packages/qwik/src.',
      noForOf:
        'Use a classic for-loop or while-loop instead of for-of in packages/qwik/src, unless iterating a Map, Set, or an entries()/values() iterator.',
    },
    schema: [],
  },
  create(context) {
    const services = context.sourceCode.parserServices ?? context.parserServices;
    const checker = services?.program?.getTypeChecker?.();

    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') {
          return;
        }
        if (getPropertyName(node.callee) === 'forEach') {
          context.report({ node, messageId: 'noForEach' });
        }
      },
      ForOfStatement(node) {
        if (node.await) {
          return;
        }
        if (hasAllowedIteratorMethod(node.right)) {
          return;
        }
        if (!checker || !services?.esTreeNodeToTSNodeMap) {
          context.report({ node, messageId: 'noForOf' });
          return;
        }

        const tsNode = services.esTreeNodeToTSNodeMap.get(node.right);
        const type = checker.getTypeAtLocation(tsNode);
        if (isAllowedType(checker, type)) {
          return;
        }

        context.report({ node, messageId: 'noForOf' });
      },
    };
  },
};
