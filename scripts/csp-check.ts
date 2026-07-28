import { spawn } from 'node:child_process';

const target = process.argv[2];
const localUrl = 'http://127.0.0.1:3000';
const expected = [
  "default-src 'self'",
  "script-src 'self' 'nonce-{NONCE}' 'strict-dynamic' 'wasm-unsafe-eval'",
  "style-src 'self' 'nonce-{NONCE}'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' https://api.anthropic.com data:",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
];

function checkCsp(value: string | null): string {
  if (!value) throw new Error('Missing Content-Security-Policy header.');
  const nonce = value.match(/script-src 'self' 'nonce-([^']+)' 'strict-dynamic'/)?.[1];
  if (!nonce) throw new Error('Missing script nonce in CSP.');
  const normalized = value
    .replaceAll(`'nonce-${nonce}'`, "'nonce-{NONCE}'")
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    normalized.length !== expected.length ||
    normalized.some((part, index) => part !== expected[index])
  ) {
    throw new Error(`Unexpected CSP: ${value}`);
  }
  return nonce;
}

async function headers(baseUrl: string): Promise<[string, string]> {
  const [one, two] = await Promise.all([
    fetch(new URL('/', baseUrl)),
    fetch(new URL('/onboarding', baseUrl)),
  ]);
  if (!one.ok || !two.ok)
    throw new Error(`Expected pages to load (got ${one.status} and ${two.status}).`);
  return [
    checkCsp(one.headers.get('content-security-policy')),
    checkCsp(two.headers.get('content-security-policy')),
  ];
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(localUrl);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for next start.');
}

async function main(): Promise<void> {
  if (target) {
    const [one, two] = await headers(target);
    if (one === two) throw new Error('CSP nonces must differ between pages.');
    process.stdout.write('Remote CSP check passed.\n');
    return;
  }

  const server = spawn('npm', ['run', 'start'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  });
  try {
    await waitForServer();
    const [one, two] = await headers(localUrl);
    if (one === two) throw new Error('CSP nonces must differ between pages.');
    process.stdout.write('Production CSP check passed.\n');
  } finally {
    if (process.platform === 'win32') server.kill();
    else process.kill(-server.pid!, 'SIGTERM');
  }
}

void main();
