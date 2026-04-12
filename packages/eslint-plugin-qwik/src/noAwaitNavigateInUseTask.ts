import type { Rule } from 'eslint';
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  Node,
  Pattern,
} from 'estree';

const USE_TASK_CALLEES = new Set(['useTask$', 'useTaskQrl']);

function isUseTaskCall(node: CallExpression): boolean {
  return node.callee.type === 'Identifier' && USE_TASK_CALLEES.has(node.callee.name);
}

function getTaskCallback(
  node: CallExpression
): ArrowFunctionExpression | FunctionExpression | null {
  const arg0 = node.arguments[0];
  if (arg0?.type === 'ArrowFunctionExpression' || arg0?.type === 'FunctionExpression') {
    return arg0;
  }
  return null;
}

function isDeferUpdatesFalse(node: Expression | Pattern | undefined): boolean {
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
    return isDeferUpdatesFalse(node.expression as Expression);
  }
  return false;
}

function hasDeferUpdatesFalseOption(node: CallExpression): boolean {
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
    if (isDeferUpdatesFalse(prop.value as Expression | Pattern)) {
      return true;
    }
  }
  return false;
}

function collectUseNavigateBoundNamesFromNode(root: Node): Set<string> {
  const ids = new Set<string>();
  const stack: Node[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      if (
        n.init.type === 'CallExpression' &&
        n.init.callee.type === 'Identifier' &&
        n.init.callee.name === 'useNavigate'
      ) {
        ids.add(n.id.name);
      }
    }
    for (const key of Object.keys(n) as (keyof Node)[]) {
      if (key === 'parent') {
        continue;
      }
      const child = (n as unknown as Record<string, unknown>)[key as string];
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && c !== null && 'type' in (c as object)) {
            stack.push(c as Node);
          }
        }
      } else if (child && typeof child === 'object' && 'type' in (child as object)) {
        stack.push(child as Node);
      }
    }
  }
  return ids;
}

function collectNavigateBindingsForUseTask(useTaskCall: CallExpression): Set<string> {
  const ids = new Set<string>();
  let current: Node | null = useTaskCall.parent;
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
    current = current.parent as Node | null;
  }
  return ids;
}

function reportAwaitedNavigateCalls(
  context: Rule.RuleContext,
  root: Node,
  navigateIds: Set<string>
) {
  const stack: Node[] = [root];
  while (stack.length) {
    const n = stack.pop()!;
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
    for (const key of Object.keys(n) as (keyof Node)[]) {
      if (key === 'parent') {
        continue;
      }
      const child = (n as unknown as Record<string, unknown>)[key as string];
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && c !== null && 'type' in (c as object)) {
            stack.push(c as Node);
          }
        }
      } else if (child && typeof child === 'object' && 'type' in (child as object)) {
        stack.push(child as Node);
      }
    }
  }
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
