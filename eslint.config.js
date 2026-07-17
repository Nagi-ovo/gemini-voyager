import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Global ignores
  {
    ignores: [
      'dist_*/**',
      'output/**',
      'node_modules/**',
      'docs/.vitepress/cache/**',
      'docs/.vitepress/dist/**',
      'coverage/**',
      'gemini-voyager-sync/**',
      'gemini-voyager-formal/**',
      '.agent/**',
      '.github/sponsors/**',
      'public/**',
      'Gemini Voyager/**',
      '.build/**',
      'safari/Models/dmg_source/**',
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
      'jsx-a11y': jsxA11y,
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

      // Accessibility rules (jsx-a11y). The plugin was a declared dependency but
      // was never wired into the flat config, so a11y was effectively unlinted.
      // Surfaced as warnings (consistent with exhaustive-deps / no-explicit-any)
      // so they show up in `bun run lint` and editors without blocking the build.
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, 'warn']),
      ),
      // Deprecated by jsx-a11y in favour of label-has-associated-control; keeping
      // it on just double-reports the same labels. Disable to avoid noise.
      'jsx-a11y/label-has-for': 'off',

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
