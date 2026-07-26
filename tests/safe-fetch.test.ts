import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchPublicJob,
  JobContentType,
  SafeFetchError,
  SafeFetchErrorKind,
  type SafeFetchDependencies,
} from '../lib/safe-fetch';

const html = (body = '<main>Job</main>', contentType: string = JobContentType.Html) => ({
  status: 200,
  headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
  body: (async function* () {
    yield new TextEncoder().encode(body);
  })(),
});

const dependencies = (addresses = ['8.8.8.8']): SafeFetchDependencies => ({
  resolveHost: async () => addresses,
  fetch: async () => html(),
  createAgent: () => ({}),
});

async function expectKind(promise: Promise<unknown>, kind: SafeFetchError['kind']) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof SafeFetchError && error.kind === kind,
  );
}

test('blocks IPv4 special ranges before connecting', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
  ]) {
    let fetched = false;
    await expectKind(
      fetchPublicJob('https://example.test', {
        ...dependencies([address]),
        fetch: async () => {
          fetched = true;
          return html();
        },
      }),
      SafeFetchErrorKind.Blocked,
    );
    assert.equal(fetched, false, address);
  }
});

test('blocks IPv6 special ranges before connecting', async () => {
  for (const address of [
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    'ff00::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ]) {
    await expectKind(
      fetchPublicJob('https://example.test', dependencies([address])),
      SafeFetchErrorKind.Blocked,
    );
  }
});

test('rejects mixed public and private DNS answers', async () => {
  let fetched = false;
  await expectKind(
    fetchPublicJob('https://example.test', {
      ...dependencies(['8.8.8.8', '10.0.0.1']),
      fetch: async () => {
        fetched = true;
        return html();
      },
    }),
    SafeFetchErrorKind.Blocked,
  );
  assert.equal(fetched, false);
});

test('rejects URL credentials and non-HTTPS ports', async () => {
  await expectKind(
    fetchPublicJob('https://user:pass@example.test', dependencies()),
    SafeFetchErrorKind.Invalid,
  );
  await expectKind(
    fetchPublicJob('https://example.test:8443', dependencies()),
    SafeFetchErrorKind.Invalid,
  );
  await expectKind(
    fetchPublicJob('http://example.test', dependencies()),
    SafeFetchErrorKind.Invalid,
  );
});

test('revalidates every redirect destination', async () => {
  let fetched = 0;
  await expectKind(
    fetchPublicJob('https://one.test', {
      resolveHost: async (host) => (host === 'one.test' ? ['8.8.8.8'] : ['127.0.0.1']),
      fetch: async () => {
        fetched += 1;
        return { status: 302, headers: { get: () => 'https://two.test/job' }, body: null };
      },
      createAgent: () => ({}),
    }),
    SafeFetchErrorKind.Blocked,
  );
  assert.equal(fetched, 1);
});

test('pins the validated DNS address into its dispatcher', async () => {
  const agents: object[] = [];
  let dispatcher: unknown;
  const result = await fetchPublicJob('https://example.test', {
    ...dependencies(['8.8.8.8']),
    createAgent: () => {
      const agent = {};
      agents.push(agent);
      return agent;
    },
    fetch: async (_url, init) => {
      dispatcher = init.dispatcher;
      return html();
    },
  });
  assert.equal(result.body, '<main>Job</main>');
  assert.equal(dispatcher, agents[0]);
});

test('maps an aborted upstream request to timeout', async () => {
  await expectKind(
    fetchPublicJob('https://example.test', {
      ...dependencies(),
      timeoutMs: 1,
      fetch: async (_url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    }),
    SafeFetchErrorKind.Timeout,
  );
});

test('rejects unsupported MIME types', async () => {
  await expectKind(
    fetchPublicJob('https://example.test', {
      ...dependencies(),
      fetch: async () => html('{}', 'application/json'),
    }),
    SafeFetchErrorKind.Mime,
  );
});

test('aborts bodies over one MiB', async () => {
  await expectKind(
    fetchPublicJob('https://example.test', {
      ...dependencies(),
      fetch: async () => ({
        status: 200,
        headers: { get: () => JobContentType.Plain },
        body: (async function* () {
          yield new Uint8Array(1024 * 1024 + 1);
        })(),
      }),
    }),
    SafeFetchErrorKind.TooLarge,
  );
});
