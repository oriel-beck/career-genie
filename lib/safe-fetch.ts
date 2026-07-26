import { Agent, fetch as undiciFetch } from 'undici';
import { isIP } from 'node:net';

const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const JobContentType = {
  Html: 'text/html',
  Plain: 'text/plain',
} as const;
export type JobContentType = (typeof JobContentType)[keyof typeof JobContentType];

export const SafeFetchErrorKind = {
  Invalid: 'invalid',
  Blocked: 'blocked',
  Timeout: 'timeout',
  Mime: 'mime',
  TooLarge: 'too-large',
  Upstream: 'upstream',
} as const;
export type SafeFetchErrorKind = (typeof SafeFetchErrorKind)[keyof typeof SafeFetchErrorKind];

export type FetchJobResult = {
  finalUrl: string;
  contentType: JobContentType;
  body: string;
};

export type SafeFetchDependencies = {
  resolveHost?: (hostname: string) => Promise<string[]>;
  fetch?: (url: string, init: FetchInit) => Promise<UpstreamResponse>;
  createAgent?: (address: string, family: 4 | 6) => PinnedAgent;
  timeoutMs?: number;
};

type FetchInit = {
  method: 'GET';
  redirect: 'manual';
  headers: Record<string, string>;
  signal: AbortSignal;
  dispatcher: unknown;
};

type UpstreamResponse = {
  status: number;
  headers: { get(name: string): string | null };
  body: AsyncIterable<Uint8Array> | null;
};

type PinnedAgent = { close?: () => Promise<void> | void };

export class SafeFetchError extends Error {
  constructor(readonly kind: SafeFetchErrorKind) {
    super(kind);
  }
}

export async function fetchPublicJob(
  rawUrl: string,
  dependencies: SafeFetchDependencies = {},
): Promise<FetchJobResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? TIMEOUT_MS);
  const resolveHost = dependencies.resolveHost ?? defaultResolve;
  const fetch = dependencies.fetch ?? defaultFetch;
  const createAgent = dependencies.createAgent ?? defaultAgent;

  try {
    let url = validateUrl(rawUrl);

    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = await resolveHost(hostname).catch((error) => {
        throw controller.signal.aborted
          ? new SafeFetchError(SafeFetchErrorKind.Timeout)
          : error;
      });
      if (controller.signal.aborted) throw new SafeFetchError(SafeFetchErrorKind.Timeout);
      if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
        throw new SafeFetchError(SafeFetchErrorKind.Blocked);
      }

      const address = addresses[0]!;
      const agent = createAgent(address, isIP(address) as 4 | 6);
      let response: UpstreamResponse;
      try {
        response = await fetch(url.href, {
          method: 'GET',
          redirect: 'manual',
          headers: { accept: 'text/html, application/xhtml+xml, text/plain' },
          signal: controller.signal,
          dispatcher: agent,
        });
      } catch {
        throw controller.signal.aborted
          ? new SafeFetchError(SafeFetchErrorKind.Timeout)
          : new SafeFetchError(SafeFetchErrorKind.Upstream);
      } finally {
        // Keep the agent open until the response body is consumed below.
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        await agent.close?.();
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new SafeFetchError(SafeFetchErrorKind.Upstream);
        try {
          url = validateUrl(new URL(location, url).href);
        } catch {
          throw new SafeFetchError(SafeFetchErrorKind.Blocked);
        }
        continue;
      }

      try {
        if (response.status < 200 || response.status >= 300) {
          throw new SafeFetchError(SafeFetchErrorKind.Upstream);
        }
        const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
        if (
          contentType !== 'text/html' &&
          contentType !== 'application/xhtml+xml' &&
          contentType !== JobContentType.Plain
        ) {
          throw new SafeFetchError(SafeFetchErrorKind.Mime);
        }
        return {
          finalUrl: url.href,
          contentType:
            contentType === JobContentType.Plain ? JobContentType.Plain : JobContentType.Html,
          body: await readBody(response.body, controller.signal),
        };
      } finally {
        await agent.close?.();
      }
    }
    throw new SafeFetchError(SafeFetchErrorKind.Upstream);
  } finally {
    clearTimeout(timer);
  }
}

function validateUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError(SafeFetchErrorKind.Invalid);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443')
  ) {
    throw new SafeFetchError(SafeFetchErrorKind.Invalid);
  }
  const hostname = url.hostname.replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new SafeFetchError(SafeFetchErrorKind.Blocked);
  }
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && !isPublicAddress(literal)) {
    throw new SafeFetchError(SafeFetchErrorKind.Blocked);
  }
  return url;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const { lookup } = await import('node:dns/promises');
  return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
}

function defaultAgent(address: string, family: 4 | 6): PinnedAgent {
  return new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    },
  });
}

async function defaultFetch(url: string, init: FetchInit): Promise<UpstreamResponse> {
  return undiciFetch(url, init as Parameters<typeof undiciFetch>[1]);
}

async function readBody(body: AsyncIterable<Uint8Array> | null, signal: AbortSignal): Promise<string> {
  if (!body) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of body) {
      if (signal.aborted) throw new SafeFetchError(SafeFetchErrorKind.Timeout);
      size += chunk.byteLength;
      if (size > MAX_BYTES) throw new SafeFetchError(SafeFetchErrorKind.TooLarge);
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    throw signal.aborted
      ? new SafeFetchError(SafeFetchErrorKind.Timeout)
      : new SafeFetchError(SafeFetchErrorKind.Upstream);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicV4(address);
  if (family === 6) return isPublicV6(address);
  return false;
}

function isPublicV4(address: string): boolean {
  const value = address.split('.').reduce((number, part) => (number << 8) + Number(part), 0) >>> 0;
  return ![
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
    [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
    [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
    [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
  ].some(([network, bits]) => (value >>> (32 - bits)) === (network >>> (32 - bits)));
}

function isPublicV6(address: string): boolean {
  const value = ipv6Value(address);
  if (value === null) return false;
  const mappedV4 = value >> 32n === 0xffffn;
  if (mappedV4) {
    const v4 = Number(value & 0xffffffffn);
    return isPublicV4([24, 16, 8, 0].map((shift) => (v4 >>> shift) & 255).join('.'));
  }
  const ranges: Array<[bigint, number]> = [
    [0n, 128],
    [1n, 128],
    [0x100n << 112n, 64],
    [0x20010db8n << 96n, 32],
    [0xfc00n << 112n, 7],
    [0xfe80n << 112n, 10],
    [0xff00n << 112n, 8],
  ];
  return !ranges.some(
    ([network, bits]) =>
      (value >> BigInt(128 - bits)) === (network >> BigInt(128 - bits)),
  );
}

function ipv6Value(address: string): bigint | null {
  const [left, right = ''] = address.toLowerCase().split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const rawParts = [...leftParts, ...rightParts];
  const ipv4 = rawParts.at(-1);
  if (ipv4?.includes('.')) {
    if (isIP(ipv4) !== 4) return null;
    const value = ipv4.split('.').map(Number);
    rawParts.splice(-1, 1, ((value[0]! << 8) + value[1]!).toString(16), ((value[2]! << 8) + value[3]!).toString(16));
  }
  const leftCount = leftParts.length - (leftParts.at(-1)?.includes('.') ? 1 : 0);
  const rightCount = rawParts.length - leftCount;
  const parts = [...rawParts.slice(0, leftCount), ...Array(8 - rawParts.length).fill('0'), ...rawParts.slice(leftCount, leftCount + rightCount)];
  if (parts.length !== 8 || parts.some((part) => !/^[\da-f]{1,4}$/.test(part))) return null;
  return parts.reduce((value, part) => (value << 16n) + BigInt(`0x${part}`), 0n);
}
