# Power-user audit (1 October 2026)

Every existing screen, judged against the rules in DECISIONS.md, "Design for power users": can someone returning from a long agent run see what needs them and act on it within a few seconds, without learning the interface? The reference design is `design/codebase-v2.html`. Screenshots were taken from the running app after a fresh `pnpm demo:reset` (PRs #67–74).

## Across the platform

- **Type.** Newsreader serif headlines, Schibsted Grotesk and IBM Plex Mono everywhere, in the app and the videos. Move to Red Hat Text and Red Hat Mono (`packages/core/src/design.ts`, `apps/web/app/globals.css`, the Remotion font bundle).
- **No "since your last visit".** Screens say "this week" or "today". A returning user needs the cut-off to be their own last visit.
- **No keyboard layer or search.** Nothing can be driven with `j`/`k`, `/`, Enter or Esc.
- **Two runtime errors** (Next.js dev overlay shows "2 Issues" on every page):
  - `apps/web/app/layout.tsx` renders the theme pre-paint `<script>` inside a React component, which React never runs on the client.
  - A hydration mismatch: relative times ("3 days ago") in `components/ReviewHome.tsx` are computed on the server and again in the browser.
- **Codebase** has no place in the navigation yet.

## Home (activity)

- Good: the headline states the answer ("2 decisions need you, 2 problems"), and "Needs you" is listed first.
- The heatmap takes the first screen: 21 unlabelled squares for 8 tasks, meaning only from a legend, no way to tell which task a square is. It won't scale past a handful of agents.
- Rows are about 90 px tall with a 20 px serif headline; 8 tasks fill 1,500 px. With 50 tasks it is unusable.
- The state ("Blocked by triage") sits in small caps at the far right, away from what it describes.
- No actions on the rows (Review, Approve), no filters by agent, state or repo.

## Task review

- The same headline appears three times: page title, video poster, transcript.
- The evidence is hidden. The defect (`refunds.ts:41`, `>` became `>=`) is not on the page until the video plays; the evidence panel says "Play the walkthrough to follow its evidence".
- The recommendation and the Approve / Request changes / Reject buttons sit below a 500 px video poster.
- "PR #73" is not a link to GitHub.
- The transcript is useful for skimming but sits at the bottom.

## Task video

- For a blocked PR the defect line appears at 0:28, after the request and the module map; the recommendation comes at 1:16. A problem PR should open with the verdict and the evidence, then context.
- Serif titles and captions.
- The agent's quoted claim gets a full slide for about 6 seconds.
- Code is small at 1080p; only the highlighted line is comfortably readable.

## Digest page

- The video poster repeats the page headline at 500 px.
- Items are good (why line, "Play from"), but have no actions.
- "All work in this digest" repeats the items above it.

## Incident

- The strongest screen: likely cause, the evidence behind it and the actions (Roll back, Pause Cursor, Mark resolved) are all visible at once.
- Inconsistent units: "4 h before the spike" and "247 minutes before the spike" for the same deploy.
- Roll back doesn't say what it will do (open a revert PR of #69 against main).
- The error title is set in 32 px mono and wraps.

## Proposed order

Status as of 1 October 2026 in brackets.

1. [Done, except the Codebase nav slot, which comes with that page] Platform: Red Hat type, fix the two runtime errors, "since your last visit" (store each user's last visit), a shared keyboard layer, a Codebase slot in the navigation.
2. [Done] Home: a dense table sorted by urgency with inline actions and filters, like the v2 Codebase table; the heatmap shrinks to a one-line agent strip.
3. [Done; the diagram slot waits for the Codebase work] Task review: verdict, findings with their code, and the decision at the top; video and transcript below; the change diagrams from v2 go here.
4. [Next] Task video: problem PRs lead with the verdict and the defect; new type.
5. [To do] Digest: inline actions, no duplicate list, a shorter video header.
6. [To do] Incident: copy fixes (units, what Roll back does), a smaller title.
