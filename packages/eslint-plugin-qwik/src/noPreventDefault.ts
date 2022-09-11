import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type {
  ArrowFunctionExpression,
  BlockStatement,
  Expression,
  FunctionExpression,
  ObjectPattern,
} from '@typescript-eslint/types/dist/generated/ast-spec';

const createRule = ESLintUtils.RuleCreator(
  () => 'https://github.com/BuilderIO/qwik/tree/main/packages/eslint-plugin-qwik'
);

export const noPreventDefault = createRule({
  name: 'no-prevent-default',
  defaultOptions: [
    {
      inlineOnly: false,
    },
  ],
  meta: {
    type: 'suggestion',
    docs: {
      description: 'no preventDefault calls',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          inlineOnly: {
            type: 'boolean',
          },
        },
        default: {
          inlineOnly: false,
        },
      },
    ],
    messages: {
      errorMessage:
        "Traditional `preventDefault()` calls don't work in Qwik, use the `preventdefault:{eventName}` attribute instead.",
    },
  },

  create(context) {
    const inlineOnly = context.options[0]?.inlineOnly ?? false;

    function handleFunctionExpression(
      expressionNode: ArrowFunctionExpression | FunctionExpression
    ) {
      if (inlineOnly) {
        const isInlineCall =
          expressionNode.parent?.type === AST_NODE_TYPES.JSXExpressionContainer &&
          expressionNode.parent.parent?.type === AST_NODE_TYPES.JSXAttribute &&
          (expressionNode.parent.parent.name.name as string)?.endsWith('$');

        if (!isInlineCall) {
          return;
        }
      }

      const firstParam = expressionNode.params?.[0];
      const eventParamName =
        firstParam?.type === AST_NODE_TYPES.Identifier ? firstParam.name : null;
      const preventDefaultParamName =
        (!eventParamName &&
          firstParam?.type === AST_NODE_TYPES.ObjectPattern &&
          getPreventDefaultParamName(firstParam)) ||
        null;

      if (!eventParamName && !preventDefaultParamName) {
        return;
      }

      const isBlockStatement = expressionNode.body.type === AST_NODE_TYPES.BlockStatement;

      if (isBlockStatement) {
        (expressionNode.body as BlockStatement).body
          .filter(
            (statement) =>
              statement.type === AST_NODE_TYPES.ExpressionStatement &&
              isPreventDefaultCall(statement.expression, eventParamName, preventDefaultParamName)
          )
          .forEach((preventDefaultCallStatement) => {
            context.report({
              node: preventDefaultCallStatement,
              messageId: 'errorMessage',
            });
          });
        return;
      }

      if (
        isPreventDefaultCall(
          expressionNode.body as Expression,
          eventParamName,
          preventDefaultParamName
        )
      ) {
        context.report({
          node: expressionNode.body,
          messageId: 'errorMessage',
        });
      }
    }

    return {
      ArrowFunctionExpression(node) {
        handleFunctionExpression(node);
      },
      FunctionExpression(node) {
        handleFunctionExpression(node);
      },
    };
  },
});

function isPreventDefaultCall(
  expression: Expression,
  eventParamName: string | null,
  preventDefaultParamName: string | null
) {
  if (expression.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  if (eventParamName) {
    return (
      expression.callee.type === AST_NODE_TYPES.MemberExpression &&
      expression.callee.object.type === AST_NODE_TYPES.Identifier &&
      expression.callee.object.name === eventParamName &&
      expression.callee.property.type === AST_NODE_TYPES.Identifier &&
      expression.callee.property.name === 'preventDefault'
    );
  }

  return (
    expression.callee.type === AST_NODE_TYPES.Identifier &&
    expression.callee.name === preventDefaultParamName
  );
}

function getPreventDefaultParamName(firstParam: ObjectPattern) {
  const preventDefaultProp = firstParam.properties.find(
    (prop) =>
      prop.type === AST_NODE_TYPES.Property &&
      prop.key.type === AST_NODE_TYPES.Identifier &&
      prop.key.name === 'preventDefault'
  );

  if (preventDefaultProp?.value?.type === AST_NODE_TYPES.Identifier) {
    return preventDefaultProp.value.name;
  }
}
