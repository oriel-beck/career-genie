import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'dist/**',
    'desktop/**',
    'node_modules/**',
    'career-genie-vault/**',
    'coverage/**',
    'blob-report/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    settings: {
      react: { version: '19' },
    },
    rules: {
      'react/no-danger': 'error',
    },
  },
]);

export default eslintConfig;
