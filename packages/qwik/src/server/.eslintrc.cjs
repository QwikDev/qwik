module.exports = {
  extends: '../../../../.eslintrc.cjs',
  plugins: ['import'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
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
  overrides: [
    {
      files: ['./qwik-types.ts'],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['packages/*'],
                message: 'Absolute imports are not allowed.',
                allowTypeImports: true,
              },
              {
                group: ['../'],
                message: 'Relative imports are not allowed.',
                allowTypeImports: true,
              },
            ],
          },
        ],
      },
    },
  ],
};
