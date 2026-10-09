// Real lint: recommended TypeScript rules for TS sources, core recommended for
// scripts, plus a separate tsc typecheck (the lint rules themselves are not
// type-aware; type safety comes from `npm run typecheck`).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.e2e-tmp/**', '.e2e-shots/**', '.local/**', 'scripts/.test-scratch-*/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', 'eslint.config.mjs', 'vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // e2e page.evaluate callbacks genuinely run in the browser.
    files: ['scripts/e2e.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    rules: {
      // Console output is the CLI/test UX in scripts; keep it allowed.
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
