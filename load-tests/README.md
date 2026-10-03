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
