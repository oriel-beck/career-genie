import { cp, mkdir, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const appDir = join(root, 'dist', 'career-genie', 'app');

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const standaloneDir = join(root, '.next', 'standalone');
  const staticDir = join(root, '.next', 'static');
  const publicDir = join(root, 'public');

  if (!(await pathExists(join(standaloneDir, 'server.js')))) {
    throw new Error('Missing standalone build. Run `npm run build` first.');
  }

  await rm(appDir, { recursive: true, force: true });
  await mkdir(appDir, { recursive: true });
  await cp(standaloneDir, appDir, { recursive: true, dereference: true });
  await mkdir(join(appDir, '.next', 'static'), { recursive: true });
  await cp(staticDir, join(appDir, '.next', 'static'), { recursive: true, dereference: true });
  if (await pathExists(publicDir)) {
    await cp(publicDir, join(appDir, 'public'), { recursive: true, dereference: true });
  }

  process.stdout.write(`Standalone app staged at ${appDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
