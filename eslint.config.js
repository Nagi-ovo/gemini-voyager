import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Global ignores
  {
    ignores: [
      'dist_*/**',
      'node_modules/**',
      'docs/.vitepress/cache/**',
      'docs/.vitepress/dist/**',
      'coverage/**',
      'gemini-voyager-sync/**',
      'gemini-voyager-formal/**',
      '.github/sponsors/**',
      'public/**',
      'safari/Models/**',
      'Gemini Voyager/**',
    ],
  },

  // TypeScript/React files
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // General best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // NOTE: Import ordering is handled by Prettier's @trivago/prettier-plugin-sort-imports
      // Do NOT add 'import/order' rule here - it will conflict with Prettier!
    },
  },

  // Disable all formatting rules that conflict with Prettier
  // This MUST be the last config to override other rules
  prettierConfig,
];
