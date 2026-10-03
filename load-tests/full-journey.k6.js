import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

const vus = Number(__ENV.VUS || 200);
const baseUrl = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const spaceId =
  __ENV.KNOWLEDGE_SPACE_PUBLIC_ID || '30000000-0000-4000-8000-000000000001';
const categoryId =
  __ENV.CATEGORY_PUBLIC_ID || '50000000-0000-4000-8000-000000000001';

const cacheCounters = {
  embedding: {
    hit: new Counter('journey_embedding_cache_hits'),
    miss: new Counter('journey_embedding_cache_misses'),
  },
  public: {
    hit: new Counter('journey_public_cache_hits'),
    miss: new Counter('journey_public_cache_misses'),
  },
  restricted: {
    hit: new Counter('journey_restricted_cache_hits'),
    miss: new Counter('journey_restricted_cache_misses'),
  },
};
const otherCacheOutcomes = new Counter('journey_cache_other_outcomes');
const missingCacheHeaders = new Counter('journey_cache_missing_headers');
const completedJourneys = new Counter('journeys_completed');
const failedJourneys = new Counter('journeys_failed');
const journeySuccess = new Rate('journey_success');
const journeyDuration = new Trend('journey_duration', true);

export const options = {
  setupTimeout: '10m',
  scenarios: {
    readers: {
      executor: 'per-vu-iterations',
      vus,
      iterations: 1,
      maxDuration: __ENV.MAX_DURATION || '10m',
    },
  },
  thresholds: {
    journey_success: ['rate==1'],
    journey_cache_missing_headers: ['count==0'],
  },
};

function requestOptions(token, name) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    tags: { name },
  };
}

function jsonResponse(response, label) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label}: HTTP ${response.status}`);
  }
  try {
    return response.json();
  } catch (_) {
    throw new Error(`${label}: invalid JSON response`);
  }
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label}: missing publicId`);
  }
  return value;
}

function login(email) {
  const result = jsonResponse(
    http.post(
      `${baseUrl}/api/auth/login`,
      JSON.stringify({ email, password: __ENV.LOAD_TEST_PASSWORD }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /auth/login [setup]' },
      },
    ),
    `Login ${email}`,
  );
  if (typeof result.accessToken !== 'string' || !result.accessToken) {
    throw new Error(`Login ${email}: missing access token`);
  }
  return result.accessToken;
}

function getSeedReaders(adminToken) {
  const members = [];
  let pageNumber = 1;
  while (true) {
    const page = jsonResponse(
      http.get(
        `${baseUrl}/api/knowledge-spaces/${spaceId}/members?pageNumber=${pageNumber}&pageSize=100`,
        requestOptions(adminToken, 'GET /members [setup]'),
      ),
      `List members page ${pageNumber}`,
    );
    if (!Array.isArray(page.items) || typeof page.hasNext !== 'boolean') {
      throw new Error(`List members page ${pageNumber}: invalid pagination`);
    }
    members.push(
      ...page.items.filter((member) =>
        /^user\d{4}@example\.com$/.test(member.email),
      ),
    );
    if (!page.hasNext) break;
    pageNumber++;
  }
  members.sort((a, b) => a.email.localeCompare(b.email));
  const selected = members.slice(0, vus);
  if (selected.length < vus) {
    throw new Error(
      `Engineering Handbook has only ${selected.length} seed readers; need ${vus}`,
    );
  }
  const publicIds = new Set();
  for (const reader of selected) {
    requiredId(reader.publicId, `Reader ${reader.email}`);
    if (publicIds.has(reader.publicId)) {
      throw new Error(`Reader ${reader.email}: duplicate publicId`);
    }
    publicIds.add(reader.publicId);
  }
  return selected;
}

function uploadDocument(adminToken, visibility, suffix) {
  const root = `${baseUrl}/api/knowledge-spaces/${spaceId}/documents`;
  const fileName = `k6-${visibility.toLowerCase()}-${Date.now()}-${suffix}.txt`;
  const content = `Load test ${visibility} guide. The answer to the test question is: use the DevNotes knowledge space.\n`;
  const upload = jsonResponse(
    http.post(
      `${root}/upload-url`,
      JSON.stringify({
        fileName,
        contentType: 'text/plain',
        fileSize: content.length,
      }),
      requestOptions(adminToken, 'POST /documents/upload-url'),
    ),
    `Admin upload URL (${visibility})`,
  );
  if (!upload.uploadUrl || !upload.storageKey) {
    throw new Error(
      `Admin upload URL (${visibility}): missing URL or storage key`,
    );
  }
  const put = http.put(upload.uploadUrl, content, {
    headers: { 'Content-Type': 'text/plain' },
    tags: { name: 'PUT presigned document' },
  });
  if (put.status < 200 || put.status >= 300) {
    throw new Error(`Admin file upload (${visibility}): HTTP ${put.status}`);
  }
  const document = jsonResponse(
    http.post(
      root,
      JSON.stringify({
        name: fileName,
        categoryPublicId: categoryId,
        storageKey: upload.storageKey,
        visibility,
      }),
      requestOptions(adminToken, 'POST /documents'),
    ),
    `Admin document create (${visibility})`,
  );
  return requiredId(document.publicId, `Admin document create (${visibility})`);
}

function waitUntilReady(adminToken, documentId) {
  const url = `${baseUrl}/api/knowledge-spaces/${spaceId}/documents/${documentId}`;
  const deadline = Date.now() + Number(__ENV.INGEST_TIMEOUT_MS || 240000);
  while (Date.now() < deadline) {
    const document = jsonResponse(
      http.get(url, requestOptions(adminToken, 'GET /documents/:id [setup]')),
      `Document ${documentId}`,
    );
    if (document.status === 'Ready') return;
    if (document.status === 'Failed') {
      throw new Error(`Document ${documentId}: ingestion failed`);
    }
    sleep(2);
  }
  throw new Error(`Document ${documentId}: ingestion timed out`);
}

export function setup() {
  if (!__ENV.LOAD_TEST_PASSWORD)
    throw new Error('Missing variable: LOAD_TEST_PASSWORD');
  if (!Number.isInteger(vus) || vus < 1)
    throw new Error('VUS must be a positive integer');
  const adminToken = login('admin@example.com');
  const editorToken = login('alice@example.com');
  const readers = getSeedReaders(adminToken).map((reader) => ({
    publicId: reader.publicId,
    token: login(reader.email),
  }));

  const publicDocumentId = uploadDocument(adminToken, 'Public', 'shared');
  const restrictedDocumentId = uploadDocument(
    adminToken,
    'Restricted',
    'private',
  );
  const permissions = [];
  for (let index = 0; index < vus; index++) {
    permissions.push({
      userPublicId: readers[index].publicId,
      permission: 'Read',
    });
  }
  jsonResponse(
    http.post(
      `${baseUrl}/api/knowledge-spaces/${spaceId}/documents/${restrictedDocumentId}/permissions`,
      JSON.stringify({ permissions }),
      requestOptions(editorToken, 'POST /documents/:id/permissions'),
    ),
    'Editor permission grant',
  );
  waitUntilReady(adminToken, publicDocumentId);
  waitUntilReady(readers[0].token, restrictedDocumentId);
  return { publicDocumentId, restrictedDocumentId, readers };
}

function recordCache(response) {
  for (const [layer, headerName] of [
    ['embedding', 'X-Chat-Cache-Embedding'],
    ['public', 'X-Chat-Cache-Public'],
    ['restricted', 'X-Chat-Cache-Restricted'],
  ]) {
    const entry = Object.entries(response.headers).find(
      ([key]) => key.toLowerCase() === headerName.toLowerCase(),
    );
    const outcome = entry?.[1];
    if (outcome === 'hit' || outcome === 'miss') {
      cacheCounters[layer][outcome].add(1);
    } else if (outcome) {
      otherCacheOutcomes.add(1, { layer, outcome });
    } else {
      missingCacheHeaders.add(1, { layer });
    }
  }
}

export default function (documents) {
  const started = Date.now();
  const reader = documents.readers[__VU - 1];
  const root = `${baseUrl}/api/knowledge-spaces/${spaceId}`;
  const question = __ENV.QUESTION || 'Where can I find the DevNotes guide?';
  try {
    const list = jsonResponse(
      http.get(
        `${root}/documents?pageNumber=1&pageSize=20`,
        requestOptions(reader.token, 'GET /documents'),
      ),
      'List documents',
    );
    if (!Array.isArray(list.items))
      throw new Error('List documents: missing items');

    for (const documentId of [
      documents.publicDocumentId,
      documents.restrictedDocumentId,
    ]) {
      const document = jsonResponse(
        http.get(
          `${root}/documents/${documentId}`,
          requestOptions(reader.token, 'GET /documents/:id'),
        ),
        'Read document',
      );
      if (document.publicId !== documentId)
        throw new Error('Read document: wrong publicId');
    }

    const session = jsonResponse(
      http.post(
        `${root}/chat-sessions`,
        null,
        requestOptions(reader.token, 'POST /chat-sessions'),
      ),
      'Create chat session',
    );
    const sessionId = requiredId(session.publicId, 'Create chat session');

    for (let index = 0; index < 2; index++) {
      const response = http.post(
        `${baseUrl}/api/chat-messages`,
        JSON.stringify({
          knowledgeSpacePublicId: spaceId,
          chatSessionPublicId: sessionId,
          content: question,
        }),
        requestOptions(reader.token, 'POST /chat-messages'),
      );
      recordCache(response);
      const message = jsonResponse(response, 'Ask chat');
      if (!message.messagePublicId)
        throw new Error('Ask chat: missing messagePublicId');
    }

    const history = jsonResponse(
      http.get(
        `${root}/chat-sessions/${sessionId}`,
        requestOptions(reader.token, 'GET /chat-sessions/:id'),
      ),
      'Read chat history',
    );
    if (history.publicId !== sessionId)
      throw new Error('Read chat history: wrong publicId');
    check(history, {
      'journey finished with messages': (value) =>
        value.messages?.items?.length >= 2,
    });
    if (history.messages?.items?.length < 2)
      throw new Error('Read chat history: fewer than 2 messages');

    completedJourneys.add(1);
    journeySuccess.add(true);
  } catch (error) {
    failedJourneys.add(1);
    journeySuccess.add(false);
    console.error(`VU ${__VU}: ${error.message}`);
  } finally {
    journeyDuration.add(Date.now() - started);
  }
}
