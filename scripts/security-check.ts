import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const failures: string[] = [];
const allowedDependencies = new Set([
  'next',
  'react',
  'react-dom',
  'dexie',
  '@anthropic-ai/sdk',
  'mammoth',
  'fflate',
  '@react-pdf/renderer',
  'undici',
]);
const allowedDevDependencies = new Set([
  'typescript',
  'eslint',
  'eslint-config-next',
  'tsx',
  'playwright',
  '@playwright/test',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  'prettier',
  'electron',
  'electron-builder',
]);

function files(directory: string): string[] {
  const path = join(root, directory);
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? files(relative(root, child)) : [child];
  });
}

function text(path: string): string {
  return readFileSync(path, 'utf8');
}

function fail(path: string, message: string): void {
  failures.push(`${relative(root, path)}: ${message}`);
}

for (const path of [...files('app'), ...files('lib'), ...files('components')]) {
  const source = text(path);
  if (source.includes('dangerouslySetInnerHTML'))
    fail(path, 'dangerouslySetInnerHTML is forbidden');
  if (/\bconsole\.(log|debug|info|warn|error)\s*\(/.test(source))
    fail(path, 'console output is forbidden');
  if (
    !['lib/keys.ts', 'lib/crypto.ts', 'lib/backup.ts'].includes(
      relative(root, path).replaceAll('\\', '/'),
    ) &&
    /(?:\.\s*(?:encryptedKey|plaintextKey)\b|\{\s*(?:encryptedKey|plaintextKey)\s*(?:,|\}))/.test(
      source,
    )
  ) {
    fail(path, 'key field read outside approved key handling');
  }
}

const eslint = join(root, 'eslint.config.mjs');
if (
  existsSync(eslint) &&
  /react\/no-danger\s*:\s*(?:['"](?:off|warn|0)['"]|0|1)/.test(text(eslint))
) {
  fail(eslint, 'react/no-danger must remain an error');
}

const routes = files('app/api')
  .filter((path) => /[\\/]route\.(?:ts|tsx|js|jsx)$/.test(path))
  .map((path) => relative(root, path).replaceAll('\\', '/'));
if (routes.length !== 1 || routes[0] !== 'app/api/fetch-job/route.ts') {
  failures.push(
    `server routes must be only app/api/fetch-job/route.ts (found: ${routes.join(', ') || 'none'})`,
  );
}

const proxy = join(root, 'proxy.ts');
const connectSource = existsSync(proxy)
  ? text(proxy)
      .match(/["`]connect-src\s+(.+?)["`]/)?.[1]
      ?.trim()
  : undefined;
if (connectSource !== "'self' https://api.anthropic.com data:") {
  failures.push('CSP connect-src must be self, api.anthropic.com, and data:');
}

const packageJson = JSON.parse(text(join(root, 'package.json'))) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
for (const name of Object.keys(packageJson.dependencies ?? {})) {
  if (!allowedDependencies.has(name)) failures.push(`forbidden dependency: ${name}`);
}
for (const name of Object.keys(packageJson.devDependencies ?? {})) {
  if (!allowedDevDependencies.has(name)) failures.push(`forbidden dev dependency: ${name}`);
}

if (failures.length) throw new Error(`Security check failed:\n${failures.join('\n')}`);
process.stdout.write('Security check passed.\n');
