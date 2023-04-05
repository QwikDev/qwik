import jsxAstUtils from 'jsx-ast-utils';

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

function isFunctionLikeExpression(node) {
  return node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
}

const defaultOptions = {
  checkFragmentShorthand: false,
  checkKeyMustBeforeSpread: false,
  warnOnDuplicates: false,
};

const messages = {
  missingIterKey: 'Missing "key" prop for element in iterator',
  missingIterKeyUsePrag:
    'Missing "key" prop for element in iterator. The key prop allows for improved rendering performance. Shorthand fragment syntax does not support providing keys. Use <Fragment> instead',
  missingArrayKey:
    'Missing "key" prop for element in array. The key prop allows for improved rendering performance.',
  missingArrayKeyUsePrag:
    'Missing "key" prop for element in array. The key prop allows for improved rendering performance. Shorthand fragment syntax does not support providing keys. Use <Fragment> instead',
  nonUniqueKeys: '`key` prop must be unique',
};

export const jsxKey = {
  meta: {
    docs: {
      description: 'Disallow missing `key` props in iterators/collection literals',
      category: 'Possible Errors',
      recommended: true,
    },

    messages,

    schema: [
      {
        type: 'object',
        properties: {
          checkFragmentShorthand: {
            type: 'boolean',
            default: defaultOptions.checkFragmentShorthand,
          },
          checkKeyMustBeforeSpread: {
            type: 'boolean',
            default: defaultOptions.checkKeyMustBeforeSpread,
          },
          warnOnDuplicates: {
            type: 'boolean',
            default: defaultOptions.warnOnDuplicates,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const modifyJsxSource = context
      .getSourceCode()
      .getAllComments()
      .some((c) => c.value.includes('@jsxImportSource'));
    if (modifyJsxSource) {
      return {};
    }
    const options = Object.assign({}, defaultOptions, context.options[0]);
    const checkFragmentShorthand = options.checkFragmentShorthand;
    const checkKeyMustBeforeSpread = options.checkKeyMustBeforeSpread;
    const warnOnDuplicates = options.warnOnDuplicates;

    function checkIteratorElement(node) {
      if (
        node.type === 'JSXElement' &&
        !jsxAstUtils.hasProp(node.openingElement.attributes, 'key')
      ) {
        context.report({
          node,
          messageId: 'missingIterKey',
        });
      } else if (checkFragmentShorthand && node.type === 'JSXFragment') {
        context.report({
          node,
          messageId: 'missingIterKeyUsePrag',
        });
      }
    }

    function getReturnStatements(node, returnStatements: any[] = []) {
      if (node.type === 'IfStatement') {
        if (node.consequent) {
          getReturnStatements(node.consequent, returnStatements);
        }
        if (node.alternate) {
          getReturnStatements(node.alternate, returnStatements);
        }
      } else if (Array.isArray(node.body)) {
        node.body.forEach((item) => {
          if (item.type === 'IfStatement') {
            getReturnStatements(item, returnStatements);
          }

          if (item.type === 'ReturnStatement') {
            returnStatements.push(item);
          }
        });
      }

      return returnStatements;
    }

    function isKeyAfterSpread(attributes) {
      let hasFoundSpread = false;
      return attributes.some((attribute) => {
        if (attribute.type === 'JSXSpreadAttribute') {
          hasFoundSpread = true;
          return false;
        }
        if (attribute.type !== 'JSXAttribute') {
          return false;
        }
        return hasFoundSpread && jsxAstUtils.propName(attribute) === 'key';
      });
    }

    /**
     * Checks if the given node is a function expression or arrow function,
     * and checks if there is a missing key prop in return statement's arguments
     * @param {ASTNode} node
     */
    function checkFunctionsBlockStatement(node) {
      if (isFunctionLikeExpression(node)) {
        if (node.body.type === 'BlockStatement') {
          getReturnStatements(node.body)
            .filter((returnStatement) => returnStatement && returnStatement.argument)
            .forEach((returnStatement) => {
              checkIteratorElement(returnStatement.argument);
            });
        }
      }
    }

    /**
     * Checks if the given node is an arrow function that has an JSX Element or JSX Fragment in its body,
     * and the JSX is missing a key prop
     * @param {ASTNode} node
     */
    function checkArrowFunctionWithJSX(node) {
      const isArrFn = node && node.type === 'ArrowFunctionExpression';
      const shouldCheckNode = (n) => n && (n.type === 'JSXElement' || n.type === 'JSXFragment');
      if (isArrFn && shouldCheckNode(node.body)) {
        checkIteratorElement(node.body);
      }
      if (node.body.type === 'ConditionalExpression') {
        if (shouldCheckNode(node.body.consequent)) {
          checkIteratorElement(node.body.consequent);
        }
        if (shouldCheckNode(node.body.alternate)) {
          checkIteratorElement(node.body.alternate);
        }
      } else if (node.body.type === 'LogicalExpression' && shouldCheckNode(node.body.right)) {
        checkIteratorElement(node.body.right);
      }
    }

    const childrenToArraySelector = `:matches(
      CallExpression
        [callee.object.object.name=Fragment]
        [callee.object.property.name=Children]
        [callee.property.name=toArray],
      CallExpression
        [callee.object.name=Children]
        [callee.property.name=toArray]
    )`.replace(/\s/g, '');
    let isWithinChildrenToArray = false;

    const seen = new WeakSet();

    return {
      [childrenToArraySelector]() {
        isWithinChildrenToArray = true;
      },

      [`${childrenToArraySelector}:exit`]() {
        isWithinChildrenToArray = false;
      },

      'ArrayExpression, JSXElement > JSXElement'(node) {
        if (isWithinChildrenToArray) {
          return;
        }

        const jsx = (node.type === 'ArrayExpression' ? node.elements : node.parent.children).filter(
          (x) => x && x.type === 'JSXElement'
        );
        if (jsx.length === 0) {
          return;
        }

        const map = {};
        jsx.forEach((element) => {
          const attrs = element.openingElement.attributes;
          const keys = attrs.filter((x) => x.name && x.name.name === 'key');

          if (keys.length === 0) {
            if (node.type === 'ArrayExpression') {
              context.report({
                node: element,
                messageId: 'missingArrayKey',
              });
            }
          }
        });

        if (warnOnDuplicates) {
          Object.values(map)
            .filter((v: any) => v.length > 1)
            .forEach((v: any) => {
              v.forEach((n) => {
                if (!seen.has(n)) {
                  seen.add(n);
                  context.report({
                    node: n,
                    messageId: 'nonUniqueKeys',
                  });
                }
              });
            });
        }
      },

      JSXFragment(node) {
        if (!checkFragmentShorthand || isWithinChildrenToArray) {
          return;
        }

        if (node.parent.type === 'ArrayExpression') {
          context.report({
            node,
            messageId: 'missingArrayKeyUsePrag',
          });
        }
      },

      // Array.prototype.map
      // eslint-disable-next-line no-multi-str
      'CallExpression[callee.type="MemberExpression"][callee.property.name="map"],\
       CallExpression[callee.type="OptionalMemberExpression"][callee.property.name="map"],\
       OptionalCallExpression[callee.type="MemberExpression"][callee.property.name="map"],\
       OptionalCallExpression[callee.type="OptionalMemberExpression"][callee.property.name="map"]'(
        node
      ) {
        if (isWithinChildrenToArray) {
          return;
        }

        const fn = node.arguments.length > 0 && node.arguments[0];
        if (!fn || !isFunctionLikeExpression(fn)) {
          return;
        }

        checkArrowFunctionWithJSX(fn);

        checkFunctionsBlockStatement(fn);
      },

      // Array.from
      'CallExpression[callee.type="MemberExpression"][callee.property.name="from"]'(node) {
        if (isWithinChildrenToArray) {
          return;
        }

        const fn = node.arguments.length > 1 && node.arguments[1];
        if (!isFunctionLikeExpression(fn)) {
          return;
        }

        checkArrowFunctionWithJSX(fn);

        checkFunctionsBlockStatement(fn);
      },
    };
  },
};
