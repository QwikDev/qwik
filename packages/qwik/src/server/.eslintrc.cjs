module.exports = {
  extends: '../../../../.eslintrc.cjs',
  plugins: ['import'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['packages/*'],
            message: 'Absolute imports are not allowed.',
          },
          {
            group: ['../'],
            message: 'Relative imports are not allowed.',
          },
        ],
      },
    ],
    'no-duplicate-imports': 'error',
    'import/no-useless-path-segments': 'error',
  },
};
