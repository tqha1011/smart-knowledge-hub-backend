const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');

const script = path.join(__dirname, 'full-journey.k6.js');
const members = [
  { email: 'admin@example.com', publicId: 'admin-id' },
  { email: 'alice@example.com', publicId: 'alice-id' },
  ...Array.from({ length: 250 }, (_, i) => ({
    email: `user${String(i + 1).padStart(4, '0')}@example.com`,
    publicId: `reader-${i + 1}`,
  })),
].reverse();

function runK6(baseUrl, vus, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('k6', ['run', '--quiet', '--no-color', script], {
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        VUS: String(vus),
        LOAD_TEST_PASSWORD: 'Password123!',
        INGEST_TIMEOUT_MS: '1000',
        ...env,
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

async function withApi(callback, settings = {}) {
  const observed = {
    logins: [],
    permissions: [],
    readers: [],
    documentReads: [],
    sessions: [],
    messages: [],
    histories: [],
  };
  let documentCount = 0;
  let sessionCount = 0;
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const url = new URL(request.url, 'http://localhost');
    const route = url.pathname;
    const auth = request.headers.authorization;
    const send = (status, data, headers = {}) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        ...headers,
      });
      response.end(JSON.stringify(data));
    };
    if (route === '/api/auth/login') {
      const credentials = JSON.parse(body);
      observed.logins.push(credentials);
      if (credentials.email === settings.failLogin)
        return send(401, { error: 'invalid credentials' });
      return send(200, { accessToken: `token:${credentials.email}` });
    }
    if (route.endsWith('/members')) {
      assert.equal(
        route,
        `/api/knowledge-spaces/${settings.spaceId || '30000000-0000-4000-8000-000000000001'}/members`,
      );
      assert.equal(auth, 'Bearer token:admin@example.com');
      const page = Number(url.searchParams.get('pageNumber'));
      const size = Number(url.searchParams.get('pageSize'));
      const listedMembers = settings.memberCount
        ? members
            .filter((member) => !member.email.startsWith('user'))
            .concat(
              members
                .filter((member) => member.email.startsWith('user'))
                .slice(0, settings.memberCount),
            )
        : members;
      return send(200, {
        items: listedMembers.slice((page - 1) * size, page * size),
        hasNext: page * size < listedMembers.length,
      });
    }
    if (route.endsWith('/upload-url'))
      return send(200, {
        uploadUrl: `http://127.0.0.1:${server.address().port}/upload`,
        storageKey: 'test-key',
      });
    if (route === '/upload') return send(200, {});
    if (route.endsWith('/documents') && request.method === 'POST') {
      assert.equal(
        JSON.parse(body).categoryPublicId,
        settings.categoryId || '50000000-0000-4000-8000-000000000001',
      );
      return send(200, { publicId: `document-${++documentCount}` });
    }
    if (route.endsWith('/permissions')) {
      assert.equal(auth, 'Bearer token:alice@example.com');
      observed.permissions = JSON.parse(body).permissions;
      return send(200, {});
    }
    if (/\/documents\/document-\d+$/.test(route)) {
      if (auth?.startsWith('Bearer token:user'))
        observed.documentReads.push(auth);
      return send(200, { publicId: route.split('/').pop(), status: 'Ready' });
    }
    if (route.endsWith('/documents')) {
      observed.readers.push(auth);
      return send(200, { items: [] });
    }
    if (route.endsWith('/chat-sessions') && request.method === 'POST') {
      observed.sessions.push(auth);
      return send(200, { publicId: `session-${++sessionCount}` });
    }
    if (route === '/api/chat-messages') {
      observed.messages.push(auth);
      return send(
        200,
        { messagePublicId: 'message-id' },
        {
          'X-Chat-Cache-Embedding': 'hit',
          'X-Chat-Cache-Public': 'hit',
          'X-Chat-Cache-Restricted': 'hit',
        },
      );
    }
    if (/\/chat-sessions\/session-\d+$/.test(route)) {
      observed.histories.push(auth);
      return send(200, {
        publicId: route.split('/').pop(),
        messages: { items: [{}, {}] },
      });
    }
    return send(404, { error: route });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`, observed);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

for (const vus of [2, 200]) {
  test(`seed accounts finish ${vus} full journeys`, async () => {
    await withApi(async (baseUrl, observed) => {
      const { code, output } = await runK6(baseUrl, vus);
      assert.equal(code, 0, output);
      assert.equal(observed.logins.length, vus + 2);
      assert(observed.logins.every((item) => item.password === 'Password123!'));
      assert.deepEqual(
        observed.permissions.map((item) => item.userPublicId),
        Array.from({ length: vus }, (_, i) => `reader-${i + 1}`),
      );
      assert.equal(observed.readers.length, vus);
      assert.deepEqual(
        observed.readers.sort(),
        Array.from(
          { length: vus },
          (_, i) =>
            `Bearer token:user${String(i + 1).padStart(4, '0')}@example.com`,
        ).sort(),
      );
      for (const reader of observed.readers) {
        assert(
          observed.documentReads.filter((auth) => auth === reader).length >= 2,
        );
        assert.equal(
          observed.sessions.filter((auth) => auth === reader).length,
          1,
        );
        assert.equal(
          observed.messages.filter((auth) => auth === reader).length,
          2,
        );
        assert.equal(
          observed.histories.filter((auth) => auth === reader).length,
          1,
        );
      }
      assert.match(output, new RegExp(`journeys_completed\\.+:\\s*${vus}\\b`));
      assert.doesNotMatch(output, /token:/);
    });
  });
}

test('setup stops before upload when there are too few seed readers', async () => {
  await withApi(
    async (baseUrl, observed) => {
      const { code, output } = await runK6(baseUrl, 2);
      assert.notEqual(code, 0);
      assert.match(output, /only 1 seed readers; need 2/);
      assert.equal(observed.logins.length, 2);
      assert.equal(observed.permissions.length, 0);
    },
    { memberCount: 1 },
  );
});

test('setup stops when a reader login fails without printing tokens', async () => {
  await withApi(
    async (baseUrl, observed) => {
      const { code, output } = await runK6(baseUrl, 2);
      assert.notEqual(code, 0);
      assert.match(output, /Login user0002@example.com: HTTP 401/);
      assert.doesNotMatch(output, /token:/);
      assert.equal(observed.permissions.length, 0);
    },
    { failLogin: 'user0002@example.com' },
  );
});

test('requires the seed password before login', async () => {
  await withApi(async (baseUrl, observed) => {
    const { code, output } = await runK6(baseUrl, 2, {
      LOAD_TEST_PASSWORD: '',
    });
    assert.notEqual(code, 0);
    assert.match(output, /Missing variable: LOAD_TEST_PASSWORD/);
    assert.equal(observed.logins.length, 0);
  });
});

test('accepts space and category overrides', async () => {
  const spaceId = '30000000-0000-4000-8000-000000000002';
  const categoryId = '50000000-0000-4000-8000-000000000003';
  await withApi(
    async (baseUrl) => {
      const { code, output } = await runK6(baseUrl, 2, {
        KNOWLEDGE_SPACE_PUBLIC_ID: spaceId,
        CATEGORY_PUBLIC_ID: categoryId,
      });
      assert.equal(code, 0, output);
    },
    { spaceId, categoryId },
  );
});
