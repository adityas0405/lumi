# Progress

Where Lumi stands: what's done, what's left and what's still open. Decisions and their reasons are in [DECISIONS.md](DECISIONS.md); the screen-by-screen audit is in [design/power-user-audit.md](design/power-user-audit.md).

Last updated 1 October 2026.

## Done

Milestones 1–7 are done (see the README's status table). In milestone 8:

| Item | What it delivers |
| --- | --- |
| Digest context | Every digest item opens with why it was asked and who asked (the requester's name, from the linked issue). Tasks closing the same request are grouped. The digest stays within 60–90 s (79 s for the demo week) |
| Digest Ask | Questions across the digest's tasks, answered from their reviews plus the evidence of the item playing, with links to the tasks |
| Outcome record | Merged, reverted (from `git revert`, GitHub's Revert button and Lumi's rollbacks), incident-linked and held-up outcomes, recorded once each. A merged rollback confirms the incident. Rollback PRs get a light entry with no video. "After review" timeline on the task page |
| Triage stability | A grounded high-severity defect always blocks; the shipping PR no longer flips between block and needs-human |
| No repeat reviews | Re-ingesting a PR whose code hasn't changed keeps its review; merging no longer re-renders the video |
| Webhooks through ngrok | GitHub webhooks reach Lumi through the account's free ngrok domain; the setup script's webhook update was fixed |
| Codebase page design | Mockups v1 (rejected) and v2 (approved): `design/codebase.html`, `design/codebase-v2.html` |
| Power-user pass, phase 1 (platform) | Red Hat Text and Red Hat Mono in the app and the video bundle; both runtime errors fixed; "since your last visit" (`user_visits`); keyboard layer (`?`, `/`, `g h`/`g d`/`g i`, page keys); shared Button, Segmented, StateWord, Kbd, KeyHints; a state word for every task |
| Power-user pass, phase 2 (inbox) | The home page is an inbox: the answer and counts first, agents as filters, one dense table sorted by urgency, a preview with findings, cited code and actions, `j`/`k`/Enter/`o`/`a`/`1`–`4`, and a stacked list on phones |
| Power-user pass, phase 3 (task review) | The page leads with the state word and headline (once), Lumi's recommendation and the decision (`a`/`r`/`x`, request changes prefilled with Lumi's reason, approving against Lumi's advice takes a second press, hidden once merged), then the findings with their cited code, visible without playing the video. Context, walkthrough, outcomes and transcript follow; the side panel has Evidence, Ask and Signals. `n`/`p` step through what needs you ("2 of 4 that need you") |

Checks at the end of phase 3: typecheck, lint and 104 tests pass; the inbox and task review render with no console errors and no horizontal overflow at 1440 and 400 px, in both themes; `a` (confirmation), `r` (prefill) and `n` were exercised in the browser.

## Left

In order:

1. **Phase 4: videos.**
   - **Order:** problem PRs open with one line on what the PR does, then the verdict and the defect with code by about 0:10, then the recommendation, then context. Clean PRs open with a 3-second verdict line.
   - **Fonts:** the new fonts in every scene.
   - **Triage citations:** each defect must cite its exact lines (at most 12), so the inbox and the task page can zoom to the defect line. Guarded by the planted-bug check, which must stay at 5 of 5.
   - Needs a `pnpm demo:reset` to re-script the videos.
2. **Phase 5: digest page.** Items first with actions, a compact player, one list instead of two, `j`/`k`.
3. **Phase 6: incident page.** Consistent units ("4 h" in both places), Roll back says what it will do, a smaller title.
4. **Codebase page and change diagrams,** built from the v2 design. Its own plan first.
   - **What it adds:** a whole-repo module graph, call paths from real call sites, before/after values.
   - **Where:** the diagrams go at the top of the task review, and the Codebase page adds `g c`.
5. **Demo prep.** Agent recording scene, an end-to-end browser test of the demo flow, three timed rehearsals from a clean reset, and the 5-minute demo script in the README.

## Open

- **Accounts still missing:** ElevenLabs (voices), Slack (digest and alerts), Twilio (phone call), and an Anthropic or paid Gemini API key before anyone but the developer uses Lumi. Today it calls Claude through the developer's own Claude Code login.
- **Processes that need restarting by hand:** the worker and the ngrok tunnel were started from a Claude Code session and stop with it. Restart them with `pnpm --filter @lumi/worker start` and `ngrok http 3000`. Only one worker may run at a time: an old worker running old code once picked up jobs during a reset.
- **Sign-in through the public URL:** `LUMI_PUBLIC_URL` now points at the ngrok domain, so links in GitHub reviews work from anywhere. Signing in through that domain hasn't been tested; the GitHub OAuth callback was registered for localhost.
- **One unexplained crash:** one manual digest rebuild (`demo/tools/digest.ts`) crashed once and the error was lost; the next run worked. Watch for it.
- **Every demo reset creates new PRs** on the public demo repo (now #67–74). Run `pnpm demo:reset` shortly before a demo, as the README says.
- **Codebase page scale:** v2 shows 9 modules. A real repo needs grouping or paging for hundreds; to settle when the page is built.
