# Decisions

Calls made while building Lumi v1, with the reason for each. Decisions Aditya made are marked **(Aditya)**.

## Product and demo

| Decision | Why |
| --- | --- |
| **(Aditya)** v1 runs on a laptop with an ngrok static domain; Oracle Cloud free tier (ARM) is the later deploy target | Fastest to build and demo; no GPU needed anywhere |
| **(Aditya)** Demo repo is `adityas0405/lumi-demo-checkout`, **public** | GitHub Actions was blocked on the private repo by an account billing issue; public repos run Actions free, and investors can click through to the PRs |
| **(Aditya)** Voice: ElevenLabs is primary, Kokoro 82M (local, open weights) is the dev/test/offline fallback | ElevenLabs is #1 on the Artificial Analysis TTS leaderboard and returns character timings; Kokoro runs on the Mac and returns word timings. Step Audio EditX and the other open models need an NVIDIA GPU or return no timings |
| The demo week's commit dates are backdated; PR open/merge times can't be, so the replay records simulated merge and decision times in Lumi's database | GitHub stamps PRs with the real clock. Commit dates are real git data, so the only adjustment is in the demo harness, never in product code |
| The bad deploy (shipping zones) happens at reset time, not in the simulated past | So the "error spike after a deploy" story is true when the demo runs. Run `pnpm demo:reset` shortly before a demo |
| Planted bug: a refund guard using `>=` instead of `>`, so full refunds are rejected, with the test that catches it skipped as "flaky" | A realistic agent failure (skipping the failing test) that a careful reviewer can find and that CI misses |
| Incident: express shipping zones only cover CA/OR/TX; NY/WA carts crash with `Cannot read properties of undefined (reading 'zone')` | Passes CI (tests only use CA/TX), crashes for real customers. The stack trace points into files the PR changed |
| Merged demo PRs carry a seeded "approve" decision by the demo owner | The digest needs history: most work was already reviewed earlier in the week |

## Architecture

| Decision | Why |
| --- | --- |
| pnpm workspaces + Turborepo | Web, worker, SDK and video share types |
| **pg-boss** job queue (Postgres) instead of BullMQ or Inngest | One fewer service to fail during a live demo; LISTEN/NOTIFY wakes workers immediately |
| Job logic lives in `packages/pipeline`; `apps/worker` only boots it | The replay script and tests can run the same handlers in-process |
| Postgres 17 in Docker on port **5433** | A Homebrew Postgres already uses 5432 on this machine |
| TypeScript 6.0, not 7.0 | typescript-eslint and parts of the ecosystem don't support TS 7 yet |
| Biome for lint and format instead of ESLint + Prettier | One fast tool across the monorepo; Next 16 no longer ships `next lint` |
| Better Auth (GitHub sign-in) for the review app, planned for milestone 5 | Auth.js v5 is still beta; Better Auth is stable and has a Drizzle adapter |
| Internal packages use extensionless relative imports | Turbopack doesn't map `.js` specifiers to `.ts` sources in transpiled workspace packages |
| Evidence refs (`diff:path#L12-L30`, `test:…`, `ci:…`) are the grounding mechanism, not the Citations API | Citations can't be combined with structured outputs; refs also drive the player's evidence sync |
| Secrets are redacted when evidence is created, line-preserving | Nothing downstream (prompts, video, logs) ever sees a secret, and diff line numbers stay valid |
| `.env*` files and key files are never read into evidence; lockfiles and build output are listed but not diffed | Safety, and review size reflects human-written code |
| CI test results come from a JUnit artifact uploaded by the workflow | Real per-test evidence (including skipped tests) without Lumi running anyone's tests |
| A task's time on the activity map is its first commit, not the PR open time | When the agent did the work |
| SDK-only repos have a null `github_id` | Agents that don't use GitHub can still report work |

## Models (milestone 3)

| Decision | Why |
| --- | --- |
| **(Aditya)** Gemini instead of Claude for triage, narration and Q&A, on the free tier for now | Aditya's call: OpenAI credits are low and the free tier is enough at this stage. The provider sits behind one interface (`packages/ai`), so Claude or OpenAI can be added by config |
| Triage leads with `gemini-3.5-flash`, narration with `gemini-3-flash-preview`, Q&A with `gemini-3.1-flash-lite`, each with fallbacks | Free-tier quotas are per model (20 requests/day, 5/minute on 3 Flash), so spreading purposes across models keeps them from competing. 3.1 Pro has no free-tier quota |
| Flash-Lite and Gemma models are never used for triage | In a probe, both routed a `>`→`>=` refund change as "auto-pass". Triage has to find bugs; Q&A only has to read listed evidence |
| Calls honour the API's "retry in Ns" hint, pace to 4/minute per model, and skip a model for an hour after it reports a daily cap | Early retries burned the daily quota by retrying caps that don't clear by waiting |
| `store: false` on every Gemini request | Customer code shouldn't sit in Google's interaction store. Note: the free tier's terms still allow Google to use prompts to improve its products, fine for the public demo repo, not for design partners' code |
| The final triage route is the stricter of the rules and the model | A model miss can't wave through failing CI, a secret or a skipped test |
| Citations a model invents are dropped before storing; a Q&A answer with no valid citation is shown as "not in the evidence" | Evidence on every claim |
| Planted-error bar: 5/5 fresh triage runs must block the refund PR and point at the guard | Met on the first run with `gemini-3-flash-preview` |
| **(Aditya)** For now Lumi calls Claude through headless Claude Code (`claude -p`) on Aditya's own login (`LUMI_LLM_PROVIDER=claude-code`) | Lumi only runs on Aditya's machine at this stage. Anthropic's docs don't allow a Claude subscription to power a product other people use, so this must switch to an API key before anyone else relies on Lumi. It's one config line |
| **(Aditya)** Sonnet 5.5 is the default for triage, narration, Q&A and digest on the claude-code provider; Opus 5.5 is the fallback | Lighter on the plan's usage limits. Sonnet caught the planted bug 5/5 with the objective check (below) |
| Each `claude -p` call runs in an empty temp directory with no tools, settings, MCP servers or skills, and without any API key in its environment | The model sees only Lumi's prompt and evidence; nothing from this repo's CLAUDE.md or the developer's setup leaks in |
| Triage never uses the authoring agent's model family (Claude Code's PRs are Opus-written, so they're reviewed by Sonnet) | Independent reviewer, per the brief |
| Planted-error check is objective: the PR must not auto-pass, and a medium/high defect's citation must cover the changed guard line | An earlier keyword-based check marked a correct answer as a miss because it was phrased differently |

## Video (milestone 4)

| Decision | Why |
| --- | --- |
| **(Aditya)** Editorial dark direction, with no stock "vibe-coded" palette: warm ink and paper, oxide only for problems, ochre for uncertainty, muted print-like persona colours, Newsreader + Schibsted Grotesk + IBM Plex Mono | Chosen from three mockups (`design/directions.html`), refined in `design/editorial.html`. Tokens live in `packages/core/src/design.ts` for the video and the app |
| Voice runs on Kokoro (local) until an ElevenLabs key is added; same interface, one env switch | No key yet. Kokoro returns word timings and costs nothing |
| One clip per sentence, cached by (provider, voice, text), joined with fixed pauses by ffmpeg; the same pauses lay out the timeline | Sentence boundaries are exact, re-renders never re-synthesise, and captions stay in sync to the millisecond |
| Captions show the written sentence; the voice reads a spoken form ("greater than or equal to" for `>=`), and the narrator is told to write for the ear | TTS mangles symbols; captions should still match what reviewers see in code |
| The narrator speaks everything; an agent's persona voice reads only its own quoted words, shown as a pull quote. Narrator commentary on a claim is a note, never a quote | Independent narrator, and no misattribution. The validator enforces it |
| Diff lines are marked in oxide only where triage pinpointed a defect (citations under 12 lines); the replaced line is found by shared identifiers in the same change block and shown struck through | Oxide means "problem". Broad citations painted whole blocks; the old line is what makes a change understandable |
| Fonts ship inside the Remotion bundle (fontsource), and assets are served to the renderer from a 127.0.0.1 file server | A live demo can't lose fonts to a network hiccup, and nothing is exposed beyond the machine |
| Screenshots only for PRs touching UI files; both commits are built in temporary clones that are deleted afterwards; identical before/after images are dropped; the view zooms to the changed region | Evidence has to show something, and customer code is never kept |
| When screenshots exist, the script must show them (validator rule) | The model skipped them once; for a UI change they are the best evidence |
| Renders run one at a time per worker; the title card plays over a 2.6 s silent lead-in | Rendering is CPU-bound. The title card states the problem before the narration starts |

## Context before review (milestone 4.5)

| Decision | Why |
| --- | --- |
| **(Aditya)** Every non-trivial task video opens with a Context chapter after the headline: the request, where the change sits, and the key decisions. *Superseded in milestone 8 for problem PRs: see "Power-user pass".* | People who let agents run autonomously lose the context; a reviewer who doesn't know what problem a diff solves can't judge it. The headline still states the problem first |
| Context is evidence-grounded like everything else: the linked issue (`task:`), the README (`doc:`), unchanged code at the base commit (`code:`), a module map built from real imports (`map:modules`), and decisions the agent logged (`decision:`) | An AI confidently explaining an architecture it half understands would undo the point. Decisions without a log must be called "inferred from the change" |
| Required for changes of 20+ reviewable lines, at most 5 sentences, always first (validator) | Orientation without padding; experts can skip the chapter |
| The module map shows three columns: used by → changed → uses, with only edges that read left to right | A layered dependency graph was unreadable; reviewers need "what uses this and what does it use" |
| Agents report decision logs through the SDK against a PR number; stored in `agent_evidence` and merged at ingest | A report can arrive before Lumi has seen the PR, and must survive re-ingests |
| The demo scenario gives every PR the GitHub issue a person filed for it, and the Claude Code PRs report decision logs | Real context for the demo: the shipping issue says "We ship to CA, OR, TX, NY and WA", which makes the crash obvious once shown next to the zone table |

## Review app (milestone 5)

| Decision | Why |
| --- | --- |
| Sign-in is a small built-in GitHub OAuth flow (the Lumi GitHub App's OAuth client, HMAC-signed session cookie, `LUMI_ALLOWED_LOGINS` allowlist) instead of Better Auth | No extra tables or dependencies for a single-workspace v1; the app's callback URL was already registered by the manifest |
| `LUMI_DEV_AUTH=<login>` bypasses sign-in only outside production builds, for automated browser tests | GitHub OAuth can't be driven headlessly; the bypass never runs in `next build` / `next start` |
| The activity map shows healthy work in a neutral paper tone, not green; only problems (oxide) and decisions (ochre) have colour | Keeps colour meaning "look here", so the one red cell is found in seconds; follows the editorial palette |
| A PR with changes requested counts as "Waiting on the agent", not healthy and not a decision | The reviewer's part is done; the work isn't |
| The player hides native controls and uses a slim control row plus the chapter bar as the scrubber | Native controls covered the captions rendered into the video |
| Plain view swaps every text surface (context, captions track, transcript, evidence lead-in) to the plain wording; the narration audio stays technical | One narration per video keeps voice cost and render time down; plain listeners read along |
| The evidence panel opens a diff at the cited lines plus the lines they replaced, with "show all" | A 40-line hunk buries the one line the sentence is about |
| Decisions post a GitHub review from the Lumi app with the reviewer's words, "Decided by @login", and the agent's mention handle; the decision is saved even if delivery fails, with the error | The agent's workflow picks up feedback from the PR; nothing a reviewer decides is lost |
| Media is streamed through an authenticated route with byte ranges; the evidence stream relays Postgres NOTIFY over server-sent events | Customer code in videos stays behind sign-in; seeking works; live progress without a separate websocket service |

## Daily digest (milestone 6)

| Decision | Why |
| --- | --- |
| **(Aditya)** No Slack yet: the digest lives in the app at `/digest` (phone-friendly); Slack delivery is built and switches on with `SLACK_BOT_TOKEN` | Slack can be set up later without code changes |
| The digest covers everything still waiting on the reviewer (however old) plus finished work since the previous digest, capped at 7 days | Pending decisions must never fall out of a digest; the first digest after a reset shows the demo week |
| Counts ("2 decisions, 2 problems, 4 tasks done") are computed in code; the model only writes the sentences | Numbers in a briefing must be right every time |
| The digest is written from each task's finished review (headline, summaries, findings, recommendation), not from the raw evidence again, and every sentence cites `review:<taskId>` | One source of truth per task; the digest can't contradict the task video |
| At most four spoken items; highlights only fill slots the decisions and problems leave; routine work is one sentence (≤18 words); items 20–35 words | Keeps the digest within 60–90 s (74 s for the demo week) with the local voice's pace |
| Work merged despite a triage block is a problem ("Shipped despite a block"), in the digest and on the home page | That is the rubber-stamping Lumi exists to catch; it also sets up the incident story |
| Built on demand from the app or automatically every morning (pg-boss schedule, `LUMI_DIGEST_CRON`, default 08:30 America/Los_Angeles) | Matches the PRD's morning-digest flow |
| Browser tests sign in with a session cookie minted from `LUMI_SESSION_SECRET`, not the dev bypass | Tests the real session path; the dev server runs without the bypass |

## Incidents (milestone 7)

| Decision | Why |
| --- | --- |
| Correlation is deterministic code, not a model: latest deploy before the spike (within 24 h), then each change it shipped ranked by stack frames inside its changed lines (high), in its changed files (medium), or only shipping together (low), plus triage risk and recency | The on-call engineer needs a fast, explainable answer; every reason shown is a fact Lumi checked |
| **(Aditya)** No Slack or phone yet: alerts appear in the app as a banner on every page and a desktop notification; Slack alerts (with Roll back / Pause buttons and signed interactivity) switch on with `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET`; the phone call stretch waits for a Twilio account | Keeps the demo's incident step working today without new accounts |
| "Simulate incident" replays a recorded Sentry alert (`demo/incidents/checkout-zone-crash.json`) as if it started now and labels it simulated; its stack frames are the real lines of the shipped code | The spike is simulated; correlation, the alert and the rollback are real |
| Roll back calls the repo's rollback webhook if configured, otherwise opens a revert PR (made in a temporary clone that is deleted afterwards) and comments on the original PR | Works with any deploy system; never touches customer infrastructure directly; nothing kept |
| Pause agent marks the agent paused, labels its open PRs `lumi:paused` and comments | Lumi can't stop a third-party agent's process; this is the signal its workflow can honour |
| A high/medium-confidence suspect gets an `incident_linked` outcome immediately, so the map and the next digest show it | The outcome record starts at the moment of suspicion; a rollback confirms it |
| Incident webhooks authenticate with Sentry's signature when `SENTRY_CLIENT_SECRET` is set, otherwise a shared `LUMI_WEBHOOK_TOKEN` | Monitoring tools can't sign in; the endpoints still can't be called anonymously |

## Digest context and Q&A (milestone 8)

| Decision | Why |
| --- | --- |
| **(Aditya)** Option 1, on by default: every narrated digest item (all decisions and problems, plus highlights when there's room) opens with a short "why it was asked" clause from its linked request (`task:` evidence) | Ties agent work back to the business request and the person who asked; makes drift from the request visible |
| **(Aditya)** Option 2, a setting that's off by default: the first digest of each week opens with a 15–20 s "state of the codebase" (areas agents touched, from task areas and module maps, counts computed in code) | Useful big picture, but it adds length; try it with design partners before making it standard |
| Routine work gets no per-task clauses in the video: one line with a grouped purpose. The digest page lists every task with its request title | The video stays a 60–90 s briefing; full context is one tap away on each task's review |
| Tasks that close the same request are grouped under it in the digest ("Support asked for…; Claude Code built…, Cursor…"); counts still count tasks | A briefing about requests, the way an owner thinks, not a list of pull requests |
| No linked request: the clause says so and uses the agent's own description, attributed | Honest, and a missing request is itself worth noticing |
| Digest Ask: questions across the digest's tasks ("what's riskiest today?"), or about the item playing, answered from those tasks' evidence with links to them | The PRD's interactive review, applied to the digest |
| Each digest item carries a separate `why` line (at most 14 words) spoken before its sentences; it cites the task's review and its `task:` request | A distinct field is checkable: the validator requires it, caps it, and requires attribution to the agent when no request is linked. The player's sync keeps working because the line also cites `review:<taskId>` |
| An item, including its why line, is 18–36 words (was 18–35 without it) | At 40 the demo digest ran 90.5 s; 36 keeps four items inside 60–90 s |
| Who asked comes from the linked issue's author: `requestedBy` (handle) and `requestedByName` (GitHub display name) on `task` evidence. Narration uses the name ("Aditya asked…"); the video card and the page show the @handle | "Who asked" has to be a fact from GitHub, not a model's guess. Handles like `adityas0405` don't survive text-to-speech |
| Tasks closing the same request are ordered together in code (`groupByRequest`); the follower's why line may be empty and must come right after its partner | Grouping is decided from data; the model only words it |
| Digest Ask reads each task's finished review (cited `review:<taskId>`) plus the full evidence of the item playing; any other citation is dropped, and an answer with none left is "not in the evidence". Answers link to the tasks they cite | The same material the digest was written from, so the answer can't contradict it; full evidence only where the reviewer is looking keeps the prompt small. Questions are stored with a `digest_id` |

## Outcome record (milestone 8)

| Decision | Why |
| --- | --- |
| Outcomes are recorded from Lumi's own ingest: `merged` when a PR merges, `reverted` on the original change when a revert of it merges, `incident_linked` when an incident names a suspect, `held_up` from an hourly sweep | What happened after review is the ground truth that shows whether reviews worked; it feeds the map, the digest and the task page |
| A revert is recognised from `This reverts commit <sha>` in its commits, `Reverts owner/repo#N` (GitHub's Revert button) or `Rolls back #N` (Lumi's rollback) in its body; a "Revert …" title alone isn't enough | Every signal names the change it undoes, so the outcome lands on the right task. A title with no link has nothing to attach to |
| **(Aditya)** A revert PR gets a light entry: no triage, no narrated video; its page links to the change it undoes and the map shows "Rollback of #N" | The review that matters is the original change's. Clicking Roll back mid-demo must not start a render |
| A merged revert of a suspected change adds "Rollback merged" to every incident that linked it | Per the incident decisions, the outcome record starts at suspicion and a rollback confirms it. Only a merged revert counts; an open one is only a proposal |
| **(Aditya)** Held up means an open change stalled for `heldUpDays` (repo setting, default 3) on either side: ready for a decision nobody has made, or changes requested with no new commits since. The label says which side | Both are where autonomous work silently stops. Work stalled on the agent is a problem on the map and in the digest; work waiting on the reviewer stays a decision, with the wait in its label |
| Outcomes are unique per (task, kind, ref) and recorded with insert-or-ignore | Re-ingests, webhook retries and the demo replay can't duplicate history |
| The task page shows outcomes under "After review", separately from the decision list above it | Decisions are already listed with the decision form; the timeline is what happened next |
| A high-severity defect whose citations survive checking forces `block`, whatever route the model chose | In testing, the shipping PR's crash was found as a high-severity defect on every run but routed `block` on some and `needs_human` on others. The route now follows the finding |
| Re-ingesting a pull request whose head commit hasn't changed keeps its review (outcomes are still recorded); only new commits, a first ingest or a failed review start one | A merge, label or CI re-run re-ran triage and re-rendered the video every time. The review describes the code, and the code didn't change |

## Design for power users (milestone 8, applies to every screen)

Lumi's users ran swarms of agents toward a long goal and come back to check the result. Every screen, including the videos, is judged by one test: can a returning user see what needs them and act on it within a few seconds, without learning the interface? The approved reference is `design/codebase-v2.html`.

| Decision | Why |
| --- | --- |
| **(Aditya)** Lead with what needs the user (problems, decisions, what changed since their last visit); background such as architecture, summaries and editorial headlines comes after | The first question after a long agent run is "what happened and what needs me", not "what is this codebase" |
| **(Aditya)** Dense and scannable over decorative: tables sorted by urgency, labelled numbers, state written as a word (Incident, Blocked, Needs you, Merged) with colour only reinforcing it, inline diffs such as `$15.00 → $12.00` | An unlabelled number or a colour-only signal has to be learned; a word doesn't |
| **(Aditya)** Actions sit where the problem is noticed (Review, Roll back, Approve, Open incident), with keyboard navigation (`j`/`k`, `/`, Enter, Esc) and search | Power users work from the keyboard and across hundreds of modules and PRs |
| **(Aditya)** No hidden modes: nothing needs a pause, toggle or hover to reveal the main answer; motion carries information and never makes the user wait | The v1 Codebase mockup hid its answer behind a toggle and made users wait for an animation |
| **(Aditya)** Type is Red Hat Text (UI) and Red Hat Mono (code, paths, numbers), replacing Newsreader, Schibsted Grotesk and IBM Plex Mono | The previous set read as generic "AI" styling; one superfamily built for small UI text suits a dense tool. The editorial palette (ink, paper, oxide for problems, ochre for waiting) stays |

## Power-user pass: platform and inbox (milestone 8)

| Decision | Why |
| --- | --- |
| The home page is the **Inbox** (renamed from "Review" in the navigation) | It is where a returning user sees what needs them and acts; the old name described the app, not the page |
| Problems and decisions always show in the inbox, whatever the time range; the range only trims finished work | Work that needs you must never fall out of view because it is old, the same rule as the digest |
| A visit ends after 30 minutes without a page view; "since your last visit" counts from the end of the previous visit, or 7 days back for someone new (`user_visits`) | The cut-off must not move while you are working through the inbox, and must move forward once you come back later |
| Every task gets a one-word state (Blocked, Needs you, Shipped over block, Stalled, With agent, Merged, Rolled back…) next to its full reason | Scannable in a column; the full reason stays in the preview |
| Approve from the inbox only where Lumi recommends approval; everything else goes through Review | Fast for the routine cases without letting a problem be waved through from a list |
| One keyboard layer: `?` lists the page's keys, `/` focuses the page's filter, `g` + letter jumps between pages, pages register their own keys, keys are ignored while typing | Power users work from the keyboard; one handler avoids pages fighting over keys |
| Dates and times render in one time zone (America/Los_Angeles), and relative times use the server's render time | The server and the browser must render the same text; mismatches broke hydration |
| A task's area ignores test files unless only tests changed | A tax change that also touched a test file was filed under the test file |
| The preview shows a finding's narrowest citation | A whole-hunk citation buries the line the finding is about |
| On the task review, the decision sits at the top under the headline; request changes starts from Lumi's reason; approving against Lumi's recommendation needs a second press; the buttons disappear once the PR is merged or closed | The reviewer decides right after reading the verdict and the finding; a one-key approve must not wave through a blocked change |
| Findings show the narrowest citation's code inline on the task page; the Triage tab becomes "Signals" (rule checks only) | The evidence was hidden until the video played; the defects now live in Findings |
| `n` / `p` on a task page step through the tasks that need you, in inbox order | Working through a queue shouldn't mean going back to the inbox each time |
| The video order for problem PRs replaces the milestone 4.5 "context first" rule: one line on what the PR does, the verdict and defect by about 0:10, the recommendation, then context. Clean PRs open with a 3-second verdict line **(Aditya)** | A reviewer of a problem PR shouldn't sit through 28 seconds of context first; every video starts the same way, so reviewers know where to look |
| A **problem PR**, for the video order, is one with a medium or high triage finding or a blocking rule signal (failing check, skipped test). Its verdict chapter is exactly three sentences: what the PR does (at most 12 words), the problem on screen (diff, tests or CI scene) citing the lines the finding cites, and the recommendation (decision scene). A clean PR's verdict is one sentence of at most 14 words starting "No problems found". The validator enforces all of it | Checkable rules keep the first ten seconds honest: the defect shown must be the one triage found, not a paraphrase |
| Triage cites each finding's exact lines first (at most 12), with any wider hunk after | The inbox, the task page and the videos zoom to the first citation; a whole-hunk citation hid the refund bug's line 41 below the fold |

## Codebase overview and diagrams (planned for milestone 8)

| Decision | Why |
| --- | --- |
| **(Aditya)** A high-level architecture overview of the customer's repo lives on its own Codebase page, not in the digest | The digest is news (what happened, why it was asked); an overview of what the codebase is rarely changes and is reference material. Built from a whole-repo module map (`buildModuleMap`), module purposes grounded in `doc:`/`code:` evidence, entry points and external services |
| Option 2 (the weekly "state of the codebase") becomes an overlay on the Codebase page, with one linked line in the weekly digest instead of a 15–20 s spoken opener | Same information, without lengthening the briefing |
| **(Aditya)** Videos gain the diagrams engineers use in design docs: a flow diagram of the changed call path, a before/after diagram when behaviour changes, and the architecture diagram. Each is built from evidence (imports, call sites, diffs); the model picks the diagram and writes labels, and the validator rejects nodes or edges not in the evidence | Diagrams make a change easier to understand than text, but only if they're true |
| **(Aditya)** Diagrams are interactive in the player: pausing on one makes it clickable (a node opens its code in the evidence panel, an edge shows the call site, Ask can answer about a selected node). The Codebase page uses the same component | One diagram system for videos, reviews and the overview |

