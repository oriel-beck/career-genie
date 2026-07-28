import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'app', 'apple-icon.png');
const target = join(root, 'desktop', 'icon.png');

async function main() {
  const sharp = (await import('sharp')).default;
  await mkdir(dirname(target), { recursive: true });
  await sharp(source).resize(512, 512).png().toFile(target);
  process.stdout.write(`Desktop icon written to ${target}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
