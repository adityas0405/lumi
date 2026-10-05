# Lumi

The review layer for work done by AI coding agents. Lumi turns what agents did into things a person can take in fast: an activity map, short narrated videos built from real evidence, an interactive review step, a daily digest, and an alert when an agent's change breaks production.

Progress, what's left and open questions are in [PROGRESS.md](PROGRESS.md). Decisions and their reasons are in [DECISIONS.md](DECISIONS.md).

## Status

| Milestone | State |
| --- | --- |
| 1. Architecture | Done |
| 2. Ingest, task model, demo repo and replay | Done |
| 3. Triage agent and story builder | Done (planted bug caught 5/5) |
| 4. Render pipeline and voice | Done (local Kokoro voice; ElevenLabs when a key is added) |
| 4.5. Context before review | Done (request, module map, agent decisions) |
| 5. Review app | Done (map, inbox, player, evidence sync, plain view, Ask, Decide → GitHub review) |
| 6. Daily digest | Done (in-app; Slack when connected) |
| 7. Incidents | Done (simulate, correlation, banner, roll back via revert PR, pause agent; Slack and phone call when connected) |
| 8. Polish and rehearsal | In progress: digest context and Ask, outcome record, triage and webhook fixes, and the power-user pass (platform and inbox done; task review, videos, digest and incident pages next). Then the Codebase page and diagrams, and demo prep. See [PROGRESS.md](PROGRESS.md) |

Waiting on accounts: ElevenLabs (voices), Slack (digest and alerts), Twilio (phone call), an Anthropic or paid Gemini API key before anyone but the developer uses Lumi (it currently calls Claude through the developer's own Claude Code login).

## Running it locally

Requires Node 24, pnpm, Docker, ffmpeg and a GitHub account with `gh` signed in.

```bash
pnpm install
pnpm db:up                                   # Postgres (and `docker compose --profile voice up -d kokoro` for the local voice)
cp .env.example .env                         # then fill it in
pnpm setup:github-app                        # creates the Lumi GitHub App (one click on github.com), then install it on the demo repo
pnpm --filter @lumi/worker start             # the pipeline worker
pnpm --filter @lumi/web dev                  # the app on http://localhost:3000
pnpm demo:reset                              # rebuilds the demo repo, all task videos and the digest (about 10 minutes)
```

Run `pnpm demo:reset` shortly before a demo: the deploy the simulated incident follows happens at reset time.

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js review app and API (webhooks, SDK ingest, media, Ask, Decide, incidents) |
| `apps/worker` | Background worker running the pipeline |
| `packages/core` | Shared types and pure logic: triage rules, script and digest validation, timelines, incident correlation, redaction |
| `packages/github` | GitHub App auth, PR normalization, CI and test evidence, context, reviews |
| `packages/ai` | Model calls: triage, narration scripts, digest, Q&A (Claude Code or Gemini provider) |
| `packages/voice` | Text-to-speech (Kokoro, ElevenLabs) and voiceover assembly |
| `packages/video` | Remotion task and digest videos |
| `packages/capture` | Before/after screenshots for UI changes |
| `packages/pipeline` | Jobs: ingest, capture, triage, script, render, digest, incidents |
| `packages/sdk-ts` | `@lumi/sdk` for agents to report work and decision logs |
| `demo/` | Demo checkout app, the scripted agent week, replay and dev tools |
| `design/` | Visual direction mockups |
