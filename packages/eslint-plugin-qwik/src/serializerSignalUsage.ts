import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import { QwikEslintExamples } from '../examples';
import { findObjectProperty, isFunctionExpression, traverseWithParents } from './utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://qwik.dev/docs/advanced/eslint/#${name}`
);

export const serializerSignalUsage = createRule({
  name: 'serializer-signal-usage',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure signals used in update() are also used in deserialize()',
    },
    schema: [],
    messages: {
      serializerSignalMismatch:
        'Signals/Stores used in update() must also be used in deserialize(). Missing: {{signals}}',
    },
  },
  defaultOptions: [],
  create(context) {
    function isSignalOrStoreName(name: string): boolean {
      return (
        name.endsWith('Signal') || name.endsWith('Store') || name === 'signal' || name === 'store'
      );
    }

    function isAssignmentTarget(node: TSESTree.Node, parent: TSESTree.Node | null): boolean {
      if (!parent) {
        return false;
      }
      return (
        (parent.type === 'AssignmentExpression' && parent.left === node) ||
        (parent.type === 'UpdateExpression' && parent.argument === node)
      );
    }

    function collectSignalsFromFunction(
      fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
    ): Set<string> {
      const signals = new Set<string>();
      const functionParams = new Set<string>();

      traverseWithParents(fn.body, (n, parent) => {
        if (n.type === 'MemberExpression' && !isAssignmentTarget(n, parent)) {
          if (n.object.type === 'Identifier' && !functionParams.has(n.object.name)) {
            if (n.property.type === 'Identifier' && n.property.name === 'value') {
              signals.add(n.object.name);
            } else if (n.property.type === 'Identifier') {
              if (isSignalOrStoreName(n.object.name)) {
                signals.add(`${n.object.name}.${n.property.name}`);
              }
            }
          }
        }

        if (n.type === 'Identifier' && !functionParams.has(n.name) && isSignalOrStoreName(n.name)) {
          signals.add(n.name);
        }
      });

      return signals;
    }

    function getReturnedSerializerObject(
      fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression
    ): TSESTree.ObjectExpression | undefined {
      if (fn.body.type === 'ObjectExpression') {
        return fn.body;
      }
      if (fn.body.type !== 'BlockStatement') {
        return undefined;
      }
      const returnStatement = fn.body.body.find(
        (stmt): stmt is TSESTree.ReturnStatement => stmt.type === 'ReturnStatement'
      );
      return returnStatement?.argument?.type === 'ObjectExpression'
        ? returnStatement.argument
        : undefined;
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type !== 'Identifier' ||
          (node.callee.name !== 'useSerializer$' && node.callee.name !== 'createSerializer$')
        ) {
          return;
        }

        const arg = node.arguments[0];
        if (!isFunctionExpression(arg)) {
          return;
        }

        const returnValue = getReturnedSerializerObject(arg);
        if (!returnValue) {
          return;
        }

        const updateProp = findObjectProperty(returnValue, 'update');
        const deserializeProp = findObjectProperty(returnValue, 'deserialize');
        const updateFn = updateProp?.value;
        const deserializeFn = deserializeProp?.value;
        if (
          !updateProp ||
          !isFunctionExpression(updateFn) ||
          !isFunctionExpression(deserializeFn)
        ) {
          return;
        }

        const updateSignals = collectSignalsFromFunction(updateFn);
        const deserializeSignals = collectSignalsFromFunction(deserializeFn);
        const allMissingSignals = [
          ...Array.from(updateSignals).filter((signal) => !deserializeSignals.has(signal)),
          ...Array.from(deserializeSignals).filter((signal) => !updateSignals.has(signal)),
        ];

        if (allMissingSignals.length > 0) {
          context.report({
            node: updateProp,
            messageId: 'serializerSignalMismatch',
            data: {
              signals: allMissingSignals.join(', '),
            },
          });
        }
      },
    };
  },
});

const serializerSignalMismatchGood = `
import { useSignal, useSerializer$ } from '@qwik.dev/core';
import MyClass from './my-class';

export default component$(() => {
  const countSignal = useSignal(0);
  
  useSerializer$(() => ({
    deserialize: () => new MyClass(countSignal.value),
    update: (myClass) => {
      myClass.count = countSignal.value;
      return myClass;
    }
  }));

  return <div>{myClass.count}</div>;
});`.trim();

const serializerSignalMismatchBad = `
import { useSignal, useSerializer$ } from '@qwik.dev/core';
import MyClass from './my-class';

export default component$(() => {
  const countSignal = useSignal(0);
  
  useSerializer$(() => ({
    deserialize: (count) => new MyClass(count),
		initial: 2,
    update: (myClass) => {
      myClass.count = countSignal.value;
      return myClass;
    }
  }));

  return <div>{myClass.count}</div>;
});`.trim();

export const serializerSignalUsageExamples: QwikEslintExamples = {
  serializerSignalMismatch: {
    good: [
      {
        codeHighlight: '/countSignal/#a',
        code: serializerSignalMismatchGood,
      },
    ],
    bad: [
      {
        codeHighlight: '/countSignal/#a',
        code: serializerSignalMismatchBad,
        description: 'The countSignal is used in update() but not in deserialize()',
      },
    ],
  },
};
