# Chat cache load test setup

`k6` is a CLI, so this project does not need an npm dependency. The script in
`chat-cache.k6.js` sends one configured question per iteration and counts actual
cache outcomes returned by the chat endpoint.

Start the backend with `LOAD_TEST_CACHE_HEADERS=true` in a test environment.
Without this flag, the endpoint does not emit cache headers and the k6 threshold
fails instead of reporting misleading hit/miss counts.

Set these environment variables before running the script:

| Variable                    | Purpose                                               |
| --------------------------- | ----------------------------------------------------- |
| `CHAT_TOKEN`                | JWT for an authorized test user                       |
| `KNOWLEDGE_SPACE_PUBLIC_ID` | Space containing the test documents                   |
| `CHAT_SESSION_PUBLIC_ID`    | Existing session in that space                        |
| `BASE_URL`                  | Backend URL; defaults to `http://localhost:3000`      |
| `QUESTION`                  | Question to repeat; defaults to `Where is the guide?` |
| `RATE`                      | Iterations per second; defaults to `1`                |
| `DURATION`                  | Test duration; defaults to `30s`                      |
| `PREALLOCATED_VUS`          | Initial virtual users; defaults to `5`                |
| `MAX_VUS`                   | Maximum virtual users; defaults to `20`               |

Run `k6 run load-tests/chat-cache.k6.js` after setting the variables. Do not
commit tokens or test data. This is a repeat-question smoke scenario; choose
the final question/user mix and load levels before using its results as a
capacity benchmark. The script reports `invalid`, `error`, and `bypass` cache
outcomes separately from hits and misses.

## Full document-to-chat journey

`full-journey.k6.js` runs one setup phase and then one complete journey per
reader VU. One Admin uploads a Public and a Restricted TXT document through
the presigned upload flow. One knowledge-space Editor grants `Read` on the
Restricted document to the readers. Setup waits until both documents are
`Ready`; only then does the measured 200-VU phase begin. Each reader lists
documents, opens both documents, creates a session, asks the same question
twice, and reads the session history. The two questions expose cold and warm
cache behavior in the existing diagnostic headers.

Use an isolated test environment. Put these settings in the backend's `.env`
before starting it:

```dotenv
LOAD_TEST_MOCK_AI=true
LOAD_TEST_AUTH_THROTTLE_BYPASS=true
LOAD_TEST_CACHE_HEADERS=true
GEMINI_EMBEDDING_MODEL=mock-embedding-v1
```

The throttle bypass applies only to `POST /api/auth/login` when both bypass
and mock AI flags are `true`. All other auth routes retain their limit. Do not
enable the bypass in a shared or production environment.

Run `npx prisma generate` and `npm run db:seed` against the isolated database,
then start the backend.
The seed creates Admin (`admin@example.com`), Editor (`alice@example.com`),
and 250 reader accounts in Engineering Handbook, all with the seed password
`Password123!`. Pass that password to k6 through the required
`LOAD_TEST_PASSWORD` variable. k6 logs in those accounts during `setup()`,
reads the space's paginated member list, selects the first `VUS` matching
`userNNNN@example.com` by email, and uses the returned user `publicId` values
when granting document permissions. Missing members or failed logins stop
setup before the measured phase.

Run a small smoke test:

```bash
LOAD_TEST_PASSWORD='Password123!' VUS=2 k6 run load-tests/full-journey.k6.js
```

Run the full test with:

```bash
LOAD_TEST_PASSWORD='Password123!' VUS=200 k6 run load-tests/full-journey.k6.js
```

The default knowledge space is `30000000-0000-4000-8000-000000000001` and the
default category is `50000000-0000-4000-8000-000000000001`; override them with
`KNOWLEDGE_SPACE_PUBLIC_ID` and `CATEGORY_PUBLIC_ID` if needed. Other optional
variables: `BASE_URL` (defaults to `http://localhost:3000`), `QUESTION`,
`INGEST_TIMEOUT_MS` (defaults to 240000), and `MAX_DURATION` (defaults to
`10m`). The script fails its cache-header threshold if
`LOAD_TEST_CACHE_HEADERS` is absent from the backend.

Mock mode replaces only the Gemini embedding and Groq answer/title clients.
The mock returns the same valid 1536-dimensional unit vector for documents and
queries, so ingestion, pgvector search, permission filtering, cache reads/writes,
and chat persistence still execute. Answer text and retrieval scores are synthetic;
do not use this run to judge answer quality or live-provider latency. No
Gemini or Groq API key is required in mock mode. Use separate Redis and database
instances for this environment so mock vectors and cache entries cannot mix
with real model data.

Run a separate small end-to-end test with `LOAD_TEST_MOCK_AI=false` and real
provider keys to check actual AI integration and answer quality within your
Gemini/Groq quotas.

Setup uploads two new documents and grants permissions on the Restricted one
on every run. Use an isolated test space and clean up old fixtures afterward.
If mock mode is off, the 200-VU chat phase calls the real embedding and chat
providers; their rate limits and charges affect the result. Login, upload,
ingestion wait, and permission setup are excluded from `journey_duration`.
The aggregate `http_req_duration` metric still includes all requests from
`setup()`, including the 202 login requests in a 200-VU run.
Document ingestion and permission updates are verified once, not load tested.
