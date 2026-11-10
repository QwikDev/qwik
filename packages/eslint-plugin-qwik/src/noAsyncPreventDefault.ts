import type { Rule } from 'eslint';
import type { Node } from 'estree';

type NodeWithParent = Node & { parent?: NodeWithParent };

const STOP_METHODS = new Set(['stopPropagation', 'stopImmediatePropagation']);

// Same test as core's isJsxPropertyAnEventName, so custom events like `on-my-event$` count too.
const EVENT_PROP = /^(?:(?:document|window):)?on.+\$$/;

const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

// Wrappers a handler can sit in and still be the prop's value: `cond ? fn : undefined`, `[fn, other$]`, `fn as T`.
const PROP_VALUE_WRAPPERS = new Set([
  'ConditionalExpression',
  'LogicalExpression',
  'ArrayExpression',
  ...TYPE_WRAPPERS,
]);

const isFunction = (node: NodeWithParent) =>
  node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';

const isInvokedImmediately = (fn: NodeWithParent) =>
  fn.parent?.type === 'CallExpression' && fn.parent.callee === fn;

const findWrapperParent = (node: NodeWithParent, wrappers: Set<string>) => {
  let child = node;
  let parent: any = node.parent;
  while (parent && wrappers.has(parent.type)) {
    child = parent;
    parent = parent.parent;
  }
  return { child, parent };
};

const isDollarArgument = (fn: NodeWithParent) => {
  const { child, parent } = findWrapperParent(fn, TYPE_WRAPPERS);
  return (
    parent?.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === '$' &&
    parent.arguments[0] === child
  );
};

const isEventPropValue = (fn: NodeWithParent) => {
  const container = findWrapperParent(fn, PROP_VALUE_WRAPPERS).parent;
  if (container?.type !== 'JSXExpressionContainer') {
    return false;
  }
  const attribute = container.parent;
  if (attribute?.type !== 'JSXAttribute') {
    return false;
  }
  const { name } = attribute;
  const propName =
    name.type === 'JSXNamespacedName' ? `${name.namespace.name}:${name.name.name}` : name.name;
  return EVENT_PROP.test(propName);
};

/**
 * Qwik's loader dispatches an event to the target and every ancestor in one synchronous pass, and a
 * handler whose chunk is not loaded yet only runs after that pass. Its preventDefault() /
 * stopPropagation() then lands after the browser default and the ancestors' handlers already ran.
 */
export const noAsyncPreventDefault: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detect preventDefault() and stopPropagation() in $(...) and on*$ event handlers, which run asynchronously.',
      recommended: true,
      url: 'https://qwik.dev/docs/components/events/#preventdefault--stoppropagation',
    },
    messages: {
      noAsyncPreventDefault:
        'This is an asynchronous function and does not support preventDefault. \nUse the preventdefault:<event> attribute or sync$() instead',
      noAsyncStopPropagation:
        'This is an asynchronous function and does not support {{method}}. \nUse the stoppropagation:<event> attribute or sync$() instead',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') {
          return;
        }
        const method = callee.property.name;
        const isPreventDefault = method === 'preventDefault';
        if (!isPreventDefault && !STOP_METHODS.has(method)) {
          return;
        }

        // Only the nearest function counts: a native listener nested in a handler runs synchronously,
        // and a sync$() argument is never the handler itself. An IIFE runs as part of its caller.
        let fn = (node as NodeWithParent).parent;
        while (fn && (!isFunction(fn) || isInvokedImmediately(fn))) {
          fn = fn.parent;
        }
        if (!fn || !(isDollarArgument(fn) || isEventPropValue(fn))) {
          return;
        }

        if (isPreventDefault) {
          context.report({ node, messageId: 'noAsyncPreventDefault' });
        } else {
          context.report({ node, messageId: 'noAsyncStopPropagation', data: { method } });
        }
      },
    };
  },
};
