import type { Rule } from 'eslint';
import type { TSESTree } from '@typescript-eslint/utils';
import { traverse } from './utils';

const USE_TASK_CALLEES = new Set(['useTask$', 'useTaskQrl']);

function isUseTaskCall(node: TSESTree.CallExpression): boolean {
  return node.callee.type === 'Identifier' && USE_TASK_CALLEES.has(node.callee.name);
}

function getTaskCallback(
  node: TSESTree.CallExpression
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
  const arg0 = node.arguments[0];
  if (arg0?.type === 'ArrowFunctionExpression' || arg0?.type === 'FunctionExpression') {
    return arg0;
  }
  return null;
}

function isDeferUpdatesFalse(node: TSESTree.Expression | TSESTree.Pattern | undefined): boolean {
  if (!node) {
    return false;
  }
  if (node.type === 'AssignmentPattern') {
    return isDeferUpdatesFalse(node.right);
  }
  if (node.type === 'Literal' && node.value === false) {
    return true;
  }
  if (node.type === 'TSAsExpression') {
    return isDeferUpdatesFalse(node.expression);
  }
  return false;
}

function hasDeferUpdatesFalseOption(node: TSESTree.CallExpression): boolean {
  const opts = node.arguments[1];
  if (!opts || opts.type !== 'ObjectExpression') {
    return false;
  }
  for (const prop of opts.properties) {
    if (prop.type !== 'Property' || prop.computed) {
      continue;
    }
    const key = prop.key;
    const name =
      key.type === 'Identifier' ? key.name : key.type === 'Literal' ? String(key.value) : null;
    if (name !== 'deferUpdates') {
      continue;
    }
    if (isDeferUpdatesFalse(prop.value)) {
      return true;
    }
  }
  return false;
}

function collectUseNavigateBoundNamesFromNode(root: TSESTree.Node): Set<string> {
  const ids = new Set<string>();
  traverse(root, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      if (
        n.init.type === 'CallExpression' &&
        n.init.callee.type === 'Identifier' &&
        n.init.callee.name === 'useNavigate'
      ) {
        ids.add(n.id.name);
      }
    }
  });
  return ids;
}

function collectNavigateBindingsForUseTask(useTaskCall: TSESTree.CallExpression): Set<string> {
  const ids = new Set<string>();
  let current: TSESTree.Node | null = useTaskCall.parent;
  while (current) {
    if (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') {
      const p = current.parent;
      if (
        p?.type === 'CallExpression' &&
        p.callee.type === 'Identifier' &&
        p.callee.name === 'component$'
      ) {
        for (const id of collectUseNavigateBoundNamesFromNode(current)) {
          ids.add(id);
        }
      }
    }
    if (current.type === 'Program') {
      for (const id of collectUseNavigateBoundNamesFromNode(current)) {
        ids.add(id);
      }
      break;
    }
    current = current.parent ?? null;
  }
  return ids;
}

function reportAwaitedNavigateCalls(
  context: Rule.RuleContext,
  root: TSESTree.Node,
  navigateIds: Set<string>
) {
  traverse(root, (n) => {
    if (n.type === 'AwaitExpression') {
      const arg = n.argument;
      if (arg.type === 'CallExpression' && arg.callee.type === 'Identifier') {
        if (navigateIds.has(arg.callee.name)) {
          context.report({
            node: n,
            messageId: 'noAwaitBlocking',
            data: { name: arg.callee.name },
          });
        }
      }
    }
  });
}

export const noAwaitNavigateInUseTask: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow awaiting the function returned by `useNavigate()` inside blocking `useTask$` callbacks.',
      recommended: true,
      url: 'https://qwik.dev/docs/advanced/eslint/',
    },
    messages: {
      noAwaitBlocking:
        'Awaiting `{{name}}()` from `useNavigate()` inside a blocking `useTask$` can deadlock. Remove `await`, or pass `{ deferUpdates: false }` as the second argument to `useTask$`.',
    },
  },
  create(context) {
    return {
      CallExpression(node: CallExpression) {
        if (!isUseTaskCall(node)) {
          return;
        }
        if (hasDeferUpdatesFalseOption(node)) {
          return;
        }
        const taskFn = getTaskCallback(node);
        if (!taskFn) {
          return;
        }
        const navigateIds = collectNavigateBindingsForUseTask(node);
        if (!navigateIds.size) {
          return;
        }
        reportAwaitedNavigateCalls(context, taskFn.body, navigateIds);
      },
    };
  },
};
