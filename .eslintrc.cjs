/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2021, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2021: true, browser: true },
  ignorePatterns: ['dist', 'node_modules', 'example', 'scripts', '*.cjs'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
    // Every line this package logs goes through src/warn.ts, which prefixes it so a merchant
    // can tell our noise from theirs. A stray console.* elsewhere bypasses that.
    'no-console': 'error',
  },
  overrides: [
    { files: ['src/warn.ts'], rules: { 'no-console': 'off' } },
    { files: ['test/**/*.ts', 'test/**/*.tsx'], env: { node: true } },
  ],
}
