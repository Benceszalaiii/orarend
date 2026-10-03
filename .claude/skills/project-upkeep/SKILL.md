---
name: project-upkeep
description: Mandatory for EVERY task in the orarend repo — features, bug fixes, refactors, tests, config, docs, even one-line changes. Keeps the Linear project "Jedlik Orarend" (team Jedlik Info, JDLK-*) in sync with the work for transparency, and keeps the public-facing docs (the /adatvedelem privacy page, README.md, SECURITY.md, PRODUCT.md, public/llms.txt, .env.example) accurate. Load it at the start of any work in this repo, before writing code, and again before committing, opening a PR or reporting back.
---

# Project upkeep: Linear + docs

Every change to this repo has two side duties that are not optional:

1. **Linear reflects the work.** Anyone looking at the Linear project should be
   able to tell what is being worked on, why, and where it stands, without
   reading the git log.
2. **The docs tell the truth.** If the change alters what the app does, what
   data it handles, or how it is run or secured, the matching document changes
   in the same branch.

Do both as part of the task, not as an afterthought. If one of them truly does
not apply, say so explicitly in the final report ("no doc affected: internal
refactor") instead of skipping silently.

## Linear

### Where things live

- Workspace `jedlikinfo`, team **Jedlik Info**, issue keys `JDLK-<n>`.
- Project: **Jedlik Orarend** (`P-JDLK-1`) — every issue for this repo belongs
  to it.
- Statuses: `Backlog` → `Todo` → `In Progress` → `In Review` → `Done`
  (also `Canceled`, `Duplicate`).
- Branch names come from Linear: `<user>/jdlk-<n>-<slug>`
  (e.g. `szalaibence0817/jdlk-16-tantargyak`). Linear issues are mirrored to
  GitHub issues on `Benceszalaiii/orarend`.
- Use the Linear MCP tools (`list_issues`, `get_issue`, `save_issue`,
  `save_comment`, `save_status_update`, …). If the Linear connector is not
  connected or not authorized, keep working, and say clearly in the final
  report that Linear was not updated and what should be updated by hand.

### At the start of a task

1. **Find the issue.** Read the branch name (`git branch --show-current`); a
   `jdlk-<n>` in it is the issue. Otherwise search the project for a matching
   open issue. Otherwise **create one** in project *Jedlik Orarend* with a
   short title and a description of the goal. Don't create duplicates.
2. **Read it** (`get_issue`, with relations) so the work matches what was
   actually asked, including comments and linked GitHub issues.
3. **Move it to `In Progress`** if it is in `Backlog`/`Todo`, and assign it to
   the user if unassigned.
4. For non-trivial work, **comment the plan** in 2–5 bullet points.

### While working

- **Comment on decisions that matter**: a changed approach, a trade-off, a
  scope cut, a discovered constraint (e.g. a Jedlikinfo API quirk). One
  concise comment per real decision — not a play-by-play.
- **Blocked?** Comment what blocks it and what is needed.
- **Out-of-scope finding** (bug, tech debt, missing test, doc gap you won't fix
  now): create a separate issue in the project and link it as related, instead
  of leaving it only in chat.
- Split work that turns out bigger than the issue into sub-issues.

### Finishing

- PR title/body references the issue (`JDLK-<n>` in the branch already links
  it; add `Fixes JDLK-<n>` to the PR body). Move the issue to **`In Review`**
  when a PR is open.
- Leave a closing comment: what changed, which docs were updated, anything
  left open (with links to follow-up issues).
- Move to **`Done`** only when the work is actually merged/shipped (the GitHub
  integration usually does this on merge — check rather than duplicate it).
  Abandoned work → `Canceled` with a reason.
- After a notable milestone (a feature shipped, a release-sized batch merged),
  post a short **project status update** on *Jedlik Orarend*
  (`save_status_update`) and keep the project's status/health accurate.

### Style

- Match the language already used in the issue (mostly Hungarian). Keep it
  short and user-facing; no secrets, tokens, `.env` values or personal data
  in Linear.
- Link, don't paste: reference files/PRs/commits instead of dumping code.

## Docs that must stay accurate

Before committing, go through the diff and check each row. If it applies,
update the doc **in the same branch**. All of these are Hungarian (except
`public/llms.txt`, which is English for AI agents); keep each file's existing
tone and structure.

| If the change… | Update |
| --- | --- |
| collects, stores, sends, or shares any data; adds/changes cookies, localStorage, IndexedDB, push, calendar feeds, login/auth, analytics/usage stats, logging of IPs or user agents, a third-party service, or a retention period | `src/app/adatvedelem/page.tsx` — the matching section, **and bump "Utolsó frissítés"** to today's date |
| adds/removes a user-visible feature or page | `README.md` → *Mit tud*; `src/app/sitemap.ts` / `robots.ts` if it's a new route |
| changes the stack, commands, setup, env vars, data source handling, scheduling, or the `src/` layout | `README.md` (*Mire épül*, *Indítás*, *Parancsok*, *Honnan jönnek az adatok*, *Felépítés*, …) |
| adds/renames/removes an env var | `.env.example` (with a Hungarian comment on what it is and whether it's secret) and README |
| touches secrets, auth, admin/stats access, cron/webhook keys, rate limiting, CORS/bot rules, input validation on API routes, or the threat surface in general | `SECURITY.md` — **create it if it doesn't exist yet** (supported version, how to report a vulnerability, what's in scope, how secrets/keys are handled) |
| changes the public JSON API (`/api/orarend`, params, response shape, caching) | `public/llms.txt` |
| changes who the product is for, its capabilities/constraints, or brand commitments | `PRODUCT.md` |
| changes the license or attribution | `LICENSE` and README *Licenc* |

Notes:

- `AGENTS.md`'s `nextjs-agent-rules` block is generated by `next dev`; never
  hand-edit it.
- The privacy page is a legal-ish promise to students. If code now does
  something the page doesn't disclose — or the page promises something the
  code no longer does — that is a bug; fix the page in the same change, and
  never weaken a stated guarantee without the user's explicit OK.
- Keep `src/` comment conventions (`//!` constraint, `//*` explanation,
  Hungarian).

## Final report checklist

End every task's report with a short block like:

```
Linear: JDLK-16 → In Review (link) · 1 follow-up: JDLK-17
Docs: adatvedelem (push retention, date bumped), README (Értesítések) · SECURITY.md n/a
```
