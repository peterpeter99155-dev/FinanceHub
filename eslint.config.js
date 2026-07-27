const typescriptEslintPlugin = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: [
      '.webpack/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'out/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...typescriptEslintPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs['recommended-latest'].rules,
    },
  },
];
