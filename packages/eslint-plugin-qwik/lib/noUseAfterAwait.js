'use strict';
exports.__esModule = true;
exports.noUseAfterAwait = void 0;
exports.noUseAfterAwait = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Object destructuring is not recomended for component$',
      category: 'Variables',
      recommended: true,
      url: 'https://github.com/BuilderIO/qwik',
    },
  },
  create: function (context) {
    var stack = [];
    return {
      ArrowFunctionExpression: function () {
        stack.push({ await: false });
      },
      'ArrowFunctionExpression:exit': function () {
        stack.pop();
      },
      AwaitExpression: function () {
        var last = stack[stack.length - 1];
        if (last) {
          last.await = true;
        }
      },
      'CallExpression[callee.name=/^use/]': function (node) {
        var last = stack[stack.length - 1];
        if (last && last.await) {
          context.report({
            node: node,
            message: 'Calling use* methods after await is not safe.',
          });
        }
      },
    };
  },
};
