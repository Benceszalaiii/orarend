---
name: run-orarend
description: Run, start, build, test, screenshot and drive the orarend (Jedlik timetable) Next.js app. Use when asked to launch the dev server, take a screenshot of /orarend, /ma or another page, click through the timetable UI, check a UI change in a real browser, smoke-test the /api JSON endpoints, call a route handler or lib function directly, or run the bun test suite.
---

orarend is a Next.js 16 (Turbopack) web app run with bun. Agents drive it with
`.claude/skills/run-orarend/driver.mjs`: a headless-Chromium (Playwright)
script runner that reads one command per line from stdin. API routes are
checked with `curl`, and lib code is called directly with `bun`.

All paths are relative to the repo root.

## Setup

Bun 1.3 and Node ≥ 20 are required. The driver has its own `package.json`,
so the app's dependencies stay untouched:

```bash
bun install
bun install --cwd .claude/skills/run-orarend
.claude/skills/run-orarend/node_modules/.bin/playwright install chromium-headless-shell
```

## Start the dev server (isolated)

```bash
REDIS_KV_REST_API_URL= DB_URL= bun run dev --port 3005 > /tmp/orarend-dev.log 2>&1 &
for i in $(seq 60); do curl -sf -o /dev/null http://localhost:3005/orarend && break; sleep 1; done
```

The empty `REDIS_KV_REST_API_URL=` and `DB_URL=` take precedence over
`.env.local`. Without them, every driver run writes usage counts to the
**real** Upstash Redis and talks to the real Postgres. With them, the
timetable works fully: Redis-backed features fall silent (`/api/naptar` →
503, usage → silent 204), and login is off (`/api/auth/get-session` → 500).
To test push, the calendar feed, or login, drop those two overrides.

Stop the server:

```bash
lsof -ti:3005 -sTCP:LISTEN | xargs kill
```

In the Claude desktop app, `preview_start {name: "orarend-dev"}` runs the
same server (from `.claude/launch.json`, port 3005, **with** `.env.local`).

## Drive the UI (agent path)

```bash
node .claude/skills/run-orarend/driver.mjs <<'EOF'
nav /orarend?class=10A
wait-for role=button[name=/ütközik/]
shot week
click role=button[name=/ütközik/] >> nth=0
click role=dialog >> role=button[name=/A csoport/]
wait-for role=button[name="Összevonások 1 szűrés rejt el órákat"]
unhover
shot merged
ls
errors get-session
EOF
```

This opens 10A's week, resolves one group-split clash ("melyik órára
jársz?") to group A, and checks that the choice landed in
`orarend:merge-prefs:v1`. Screenshots are written to
`.claude/skills/run-orarend/shots/<name>.png`. Open them with Read and look
at them. The driver exits non-zero on the first failing command.

Mobile viewport plus the `/ma` page for a chosen class:

```bash
node .claude/skills/run-orarend/driver.mjs <<'EOF'
mobile
nav /ma
set-ls orarend:class:v1 13C
nav /ma
wait-for role=button[name="13C ma"]
wait-gone text=/mentett órarend/
shot ma-mobile
errors get-session
EOF
```

To pin "now" (the Most rail, /ma, which week shows by default), use `clock`
before `nav`:

```bash
node .claude/skills/run-orarend/driver.mjs <<'EOF'
clock 2026-10-06T12:00:00+02:00
nav /orarend?class=13C
wait-for text=Hétfő
wait-gone text=/mentett órarend/
unhover
shot clock-next-week
errors get-session
EOF
```

| command | what it does |
|---|---|
| `mobile` | **first line only**: iPhone 13 viewport, touch, and UA |
| `nav <path\|url>` | goto `BASE` + path (default `http://localhost:3005`) |
| `clock <ISO>` | freeze the browser's `Date` (use before `nav`) |
| `wait-for <sel>` / `wait-gone <sel>` | wait up to 30 s for the element to be visible / hidden |
| `click <sel>`, `select <sel> <opt>`, `fill <sel> <text>`, `press <key>` | act (`<sel>` in `select`/`fill` must have no spaces) |
| `unhover` | move the mouse to the corner (see Gotchas) |
| `shot [name]`, `shot-el <sel> [name]` | PNG of the viewport / one element |
| `aria [sel]` | ARIA snapshot: roles and accessible names. **Use this to find selectors.** |
| `text [sel]`, `eval <js>` | innerText / evaluate a JS expression in the page |
| `ls`, `set-ls <key> <value>` | dump / set localStorage (all app state lives under `orarend:*`) |
| `errors [ignore-re]`, `errors-soft [ignore-re]` | console errors + ≥400 responses: fail / print |
| `sleep <ms>` | last resort |

Selectors are Playwright locators: `role=button[name=/regex/]`,
`text=Hétfő`, `css >> nth=0`, and `>> visible=true`. Env vars: `BASE`, `SHOTS`, and
`PROFILE`. The profile at `.claude/skills/run-orarend/.profile` persists
localStorage between runs. `rm -rf` it to start as a first-time visitor.

## Smoke-test the JSON API

```bash
for u in '/api/orarend' '/api/orarend?osztaly=13.c' '/api/orarend?osztaly=ZZZ' '/api/orarend?het=nope&osztaly=13C' '/api/termek' '/api/tantargyak?kereses=mat'; do printf '%-40s ' "$u"; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "http://localhost:3005$u"; done
```

Expected results: 200, 200, 404, 400, 200, 200, all
`application/json; charset=utf-8`. `/llms.txt` documents the parameters.

## Direct invocation (no server)

Most PRs touch `src/lib/*` or `src/app/api/*/route.ts`. Import and call
those directly from the repo root, where bun resolves the `@/` alias:

```bash
bun -e 'const { GET } = await import("./src/app/api/orarend/route.ts"); const r = await GET(new Request("http://x/api/orarend?osztaly=ZZZ")); console.log(r.status, await r.text())'
```

Modules that `import "server-only"` (the `*-store.ts` files and
`push-send.ts`) throw when imported this way. Preload the test shim, which
also swaps Redis for an in-memory fake and sets `TZ=Europe/Budapest`:

```bash
bun --preload ./src/test/preload.ts -e 'const m = await import("./src/lib/push-store.ts"); console.log(Object.keys(m).slice(0,6))'
```

## Test

```bash
bun test
```

820 tests in 71 files pass in about 1 s. The `push delivery failed { status:
500 }` line in the output is expected log noise from `push-send.test.ts`.

`bun run lint` (Biome) **already fails on main** (about 16 errors in
`calendar.tsx`, `iphone.tsx`, and others). To check only the files you
touched, use `bunx biome check <paths>`.

## Gotchas

- **One `next dev` per checkout.** Next 16 refuses a second dev server in the
  same directory ("Another next dev server is already running", exit 1),
  even on another port. Kill the first one (or reuse it) before restarting
  with different env.
- **Hover dims the grid.** Hovering a lesson highlights that subject and dims
  every other one. After any `click`, the mouse stays where it clicked, so
  run `unhover` before `shot`, or the screenshot looks broken.
- **The "Offline · mentett órarend" banner is transient.** On a warm profile
  the cached week is painted first and then replaced by fresh data. Run
  `wait-gone text=/mentett órarend/` before screenshots and text checks.
- **Only the week grid reads `?class=`.** `/orarend?class=10A` works, but
  `/ma?class=13C` ignores the param and shows the profile's stored class.
  Use `set-ls orarend:class:v1 <class>` and then `nav` again.
- **`text=10A` matches hidden `<option>`s first.** The class picker is a
  native `<select>` with every class. Use `select role=combobox[name="Osztály"] 10A`,
  then `wait-for text=10A >> visible=true`.
- **Data is live.** Lessons come from jedlikinfo.jedlik.eu through the
  `/api/jedlik` rewrite. Results depend on the real week and the real
  clock, so pin time with `clock` when a check depends on "now". With
  `clock`, server-rendered parts still use real time.
- **The README says `/` redirects to `/orarend`.** It no longer does: `/` is
  the landing page (200), and `proxy.ts` only redirects when there is a
  last-view cookie.
- **The Next dev-tools "N" badge** sits in the bottom-left of every
  screenshot. It comes from dev mode and is not part of the app.
- **macOS has no `timeout`.** That is why the wait loops above use
  `for i in $(seq N)`. They also work on Linux.

## Troubleshooting

- **`FAIL: ... 500 http://localhost:3005/api/auth/get-session`** from
  `errors`: the server is running without `DB_URL`. Use `errors get-session`,
  or start the server with `.env.local` intact.
- **`locator.waitFor: Timeout 30000ms exceeded` after `select`**: the
  selector matched a hidden `<option>`. Add `>> visible=true`.
- **`Error: This module cannot be imported from a Client Component module`**
  (thrown from `node_modules/server-only/index.js`) under `bun -e`: add
  `--preload ./src/test/preload.ts`.
