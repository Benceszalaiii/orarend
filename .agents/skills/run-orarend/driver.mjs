#!/usr/bin/env node
// Headless-Chromium driver for orarend. Reads one command per line from stdin
// (or from argv when given), runs them in order against a persistent profile,
// prints results, exits non-zero on the first failing command.
//
//   node .claude/skills/run-orarend/driver.mjs <<'EOF'
//   nav /orarend
//   wait-for text=Hétfő
//   shot week
//   errors
//   EOF
//
// BASE (default http://localhost:3005), SHOTS (default <skill>/shots),
// PROFILE (default <skill>/.profile — keeps localStorage + cookies between runs;
// `rm -rf` it for a first-visit user).
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:3005";
const SHOTS = resolve(process.env.SHOTS ?? join(here, "shots"));
const PROFILE = resolve(process.env.PROFILE ?? join(here, ".profile"));
mkdirSync(SHOTS, { recursive: true });

const lines = (
  process.argv.length > 2
    ? process.argv.slice(2).join("\n")
    : readFileSync(0, "utf8")
)
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

// `mobile` must come first: it decides how the context is built.
const mobile = lines[0] === "mobile";
if (mobile) lines.shift();

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  locale: "hu-HU",
  timezoneId: "Europe/Budapest",
  colorScheme: "dark",
  ...(mobile
    ? devices["iPhone 13"]
    : { viewport: { width: 1440, height: 900 } }),
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(10_000);
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
const failed = [];
page.on(
  "response",
  (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`),
);

// `text=Foo`, `role=button[name=Foo]` etc. go straight to Playwright locators.
const loc = (sel) => page.locator(sel).first();
const rest = (parts) => parts.slice(1).join(" ");

const commands = {
  // nav <path-or-url>
  nav: async (p) => {
    const url = rest(p).startsWith("http") ? rest(p) : BASE + rest(p);
    const r = await page.goto(url, { waitUntil: "domcontentloaded" });
    return `${r?.status()} ${page.url()}`;
  },
  // clock <ISO time> — freeze the page clock (use BEFORE nav). The "Most"
  // rail, /ma and the default week all follow the browser's Date, e.g.
  // `clock 2026-10-01T09:00:00+02:00`. Server-rendered bits still use real time.
  clock: async (p) => {
    await page.clock.setFixedTime(new Date(p[1]));
  },
  // wait-for <selector> — 30s, covers Turbopack's first compile of a route
  "wait-for": async (p) => {
    await loc(rest(p)).waitFor({ state: "visible", timeout: 30_000 });
  },
  // wait-gone <selector> — e.g. the transient "mentett órarend" banner
  "wait-gone": async (p) => {
    await loc(rest(p)).waitFor({ state: "hidden", timeout: 30_000 });
  },
  click: async (p) => {
    await loc(rest(p)).click();
  },
  // fill <selector> <value>   (selector must not contain spaces)
  fill: async (p) => {
    await loc(p[1]).fill(p.slice(2).join(" "));
  },
  // select <selector> <option> — native <select> (e.g. the class picker)
  select: async (p) => {
    await loc(p[1]).selectOption(p.slice(2).join(" "));
  },
  // unhover — park the mouse in the corner. Hovering a lesson dims every
  // other subject, so a `click` leaves the grid dimmed until you do this.
  unhover: async () => {
    await page.mouse.move(1, 1);
  },
  press: async (p) => {
    await page.keyboard.press(p[1]);
  },
  sleep: async (p) => {
    await page.waitForTimeout(Number(p[1]));
  },
  // shot [name] — full viewport PNG into SHOTS
  shot: async (p) => {
    const file = join(SHOTS, `${p[1] ?? Date.now()}.png`);
    await page.screenshot({ path: file });
    return file;
  },
  // shot-el <selector> <name>
  "shot-el": async (p) => {
    const file = join(SHOTS, `${p[2] ?? Date.now()}.png`);
    await loc(p[1]).screenshot({ path: file });
    return file;
  },
  // text [selector] — innerText, trimmed to 3000 chars
  text: async (p) => (await loc(rest(p) || "body").innerText()).slice(0, 3000),
  // eval <js expression> — runs in the page, result JSON-printed
  eval: async (p) => JSON.stringify(await page.evaluate(rest(p))),
  // aria [selector] — Playwright ARIA snapshot: roles + accessible names,
  // the fastest way to find what to click (labels are Hungarian)
  aria: async (p) =>
    (await loc(rest(p) || "body").ariaSnapshot()).slice(0, 6000),
  // ls — localStorage, values cut to 160 chars (all app state lives there,
  // keys `orarend:*`; `orarend:week-cache:v1` alone is ~20 KB)
  ls: async () =>
    (
      await page.evaluate(() =>
        Object.entries(localStorage).map(
          ([k, v]) => `${k} = ${v.slice(0, 160)}`,
        ),
      )
    ).join("\n"),
  // set-ls <key> <value> — then `nav` again so the app reads it
  "set-ls": async (p) => {
    await page.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [p[1], p.slice(2).join(" ")],
    );
  },
  // errors [ignore-regex] — console errors + >=400 responses seen so far;
  // fails if any are left after dropping lines matching the regex. Without
  // DB_URL every page 500s on /api/auth/get-session: `errors get-session`.
  errors: async (p) => {
    const all = seenErrors(rest(p));
    if (all.length) throw new Error(all.join("\n"));
    return "none";
  },
  // errors-soft [ignore-regex] — same, but only prints
  "errors-soft": async (p) => seenErrors(rest(p)).join("\n") || "none",
};

function seenErrors(ignore) {
  const skip = ignore ? new RegExp(ignore) : null;
  return [
    // Chrome's "Failed to load resource" carries no URL; `failed` has it.
    ...consoleErrors.filter((m) => !m.startsWith("Failed to load resource")),
    ...failed,
  ].filter((m) => !skip?.test(m));
}

let code = 0;
for (const line of lines) {
  const parts = line.split(/\s+/);
  const fn = commands[parts[0]];
  process.stdout.write(`> ${line}\n`);
  try {
    if (!fn)
      throw new Error(
        `unknown command; known: ${Object.keys(commands).join(", ")}`,
      );
    // Commands that only act return nothing; print "ok" for them.
    console.log((await fn(parts)) ?? "ok");
  } catch (e) {
    console.log(`FAIL: ${e.message.split("\n").slice(0, 8).join("\n")}`);
    code = 1;
    break;
  }
}
await ctx.close();
process.exit(code);
