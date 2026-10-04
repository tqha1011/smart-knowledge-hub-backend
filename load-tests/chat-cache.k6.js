import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const counters = {
  embedding: {
    hit: new Counter('chat_embedding_cache_hits'),
    miss: new Counter('chat_embedding_cache_misses'),
  },
  public: {
    hit: new Counter('chat_public_cache_hits'),
    miss: new Counter('chat_public_cache_misses'),
  },
  restricted: {
    hit: new Counter('chat_restricted_cache_hits'),
    miss: new Counter('chat_restricted_cache_misses'),
  },
};
const otherOutcomes = new Counter('chat_cache_other_outcomes');
const missingHeaders = new Counter('chat_cache_missing_headers');

export const options = {
  scenarios: {
    chat: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 1),
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: Number(__ENV.PREALLOCATED_VUS || 5),
      maxVUs: Number(__ENV.MAX_VUS || 20),
    },
  },
  thresholds: {
    chat_cache_missing_headers: ['count==0'],
  },
};

export function setup() {
  const required = [
    'CHAT_TOKEN',
    'KNOWLEDGE_SPACE_PUBLIC_ID',
    'CHAT_SESSION_PUBLIC_ID',
  ];
  const missing = required.filter((name) => !__ENV[name]);
  if (missing.length > 0) {
    throw new Error(`Missing k6 environment variables: ${missing.join(', ')}`);
  }
}

function header(response, name) {
  const entry = Object.entries(response.headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

export default function () {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
  const response = http.post(
    `${baseUrl}/api/chat-messages`,
    JSON.stringify({
      knowledgeSpacePublicId: __ENV.KNOWLEDGE_SPACE_PUBLIC_ID,
      chatSessionPublicId: __ENV.CHAT_SESSION_PUBLIC_ID,
      content: __ENV.QUESTION || 'Where is the guide?',
    }),
    {
      headers: {
        Authorization: `Bearer ${__ENV.CHAT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      tags: { name: 'POST /api/chat-messages' },
    },
  );

  check(response, {
    'chat request succeeded': (res) => res.status >= 200 && res.status < 300,
  });

  for (const [layer, headerName] of [
    ['embedding', 'X-Chat-Cache-Embedding'],
    ['public', 'X-Chat-Cache-Public'],
    ['restricted', 'X-Chat-Cache-Restricted'],
  ]) {
    const outcome = header(response, headerName);
    if (outcome === 'hit' || outcome === 'miss') {
      counters[layer][outcome].add(1);
    } else if (outcome) {
      otherOutcomes.add(1, { layer, outcome });
    } else {
      missingHeaders.add(1, { layer });
    }
  }
}
