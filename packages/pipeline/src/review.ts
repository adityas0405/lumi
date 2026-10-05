import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStory, runTriage } from "@lumi/ai";
import { captureBeforeAfter } from "@lumi/capture";
import { type Evidence, PERSONAS, refs, type TaskScript, toWebVtt, triageRules } from "@lumi/core";
import {
  dataDir,
  ensureDir,
  evidence as evidenceTable,
  getDb,
  renders,
  repos,
  scripts,
  tasks,
  triageResults,
} from "@lumi/db";
import { repoOctokit } from "@lumi/github";
import { AssetServer, buildTaskVideoProps, renderTaskVideo } from "@lumi/video";
import { buildVoiceover } from "@lumi/voice";
import { desc, eq } from "drizzle-orm";
import { log } from "./log";
import { DEFAULT_SETTINGS, expiryDate, setTaskStatus } from "./store";

async function loadTask(taskId: string) {
  const db = getDb();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error(`Task ${taskId} not found`);
  const rows = await db.select().from(evidenceTable).where(eq(evidenceTable.taskId, taskId));
  const evidence: Evidence[] = rows.map((r) => ({
    ref: r.ref,
    kind: r.kind,
    title: r.title,
    payload: r.payload,
    blobPath: r.blobPath,
  }));
  return { task, evidence };
}

/** Rule signals + model review for one task; stores the result. */
export async function triageTask(taskId: string) {
  const { task, evidence } = await loadTask(taskId);
  await setTaskStatus(taskId, "triaging", { progress: 0.25, detail: "Reviewing the change" });
  const hunks = evidence.flatMap((e) => (e.payload.kind === "diff_hunk" ? [e.payload.hunk] : []));
  const tests = evidence.flatMap((e) => (e.payload.kind === "test_case" ? [e.payload.test] : []));
  const ci = evidence.flatMap((e) =>
    e.payload.kind === "ci_step" && e.payload.step.name !== "tests" ? [e.payload.step] : [],
  );
  const signals = triageRules({
    files: task.files,
    hunks,
    tests,
    ci,
    ciPending: ci.some((s) => s.conclusion === "pending"),
    secretFindings: task.secretFindings,
    agentClaim: task.agentClaim,
  });
  // Keep the reviewer off the model family that wrote the code.
  const family = PERSONAS[task.agent].modelFamily;
  const authorModel =
    family === "anthropic-opus"
      ? "claude-opus"
      : family === "anthropic-sonnet"
        ? "claude-sonnet"
        : null;
  const outcome = await runTriage({ title: task.title, evidence, signals, authorModel });
  await getDb().insert(triageResults).values({
    taskId,
    route: outcome.route,
    wouldAutoPass: outcome.wouldAutoPass,
    score: outcome.score,
    summary: outcome.verdict.summary,
    signals: outcome.signals,
    reasons: outcome.verdict.reasons,
    suspectedDefects: outcome.verdict.suspectedDefects,
    model: outcome.model,
  });
  log.info(
    {
      taskId,
      pr: task.prNumber,
      route: outcome.route,
      score: outcome.score,
      defects: outcome.verdict.suspectedDefects.length,
    },
    "triage done",
  );
  return outcome;
}

/** Writes and validates the narration script for a task. */
export async function scriptTask(taskId: string) {
  const { task, evidence } = await loadTask(taskId);
  const db = getDb();
  const triage = await db.query.triageResults.findFirst({
    where: eq(triageResults.taskId, taskId),
    orderBy: desc(triageResults.createdAt),
  });
  await setTaskStatus(taskId, "scripting", { progress: 0.45, detail: "Writing the walkthrough" });
  const result = await buildStory({
    title: task.title,
    agent: task.agent,
    evidence,
    files: task.files,
    signals: triage?.signals ?? [],
    verdict: triage
      ? {
          route: triage.route,
          summary: triage.summary,
          reasons: triage.reasons,
          suspectedDefects: triage.suspectedDefects as never,
        }
      : null,
  });
  const previous = await db.query.scripts.findFirst({
    where: eq(scripts.subjectId, taskId),
    orderBy: desc(scripts.version),
  });
  const [row] = await db
    .insert(scripts)
    .values({
      subjectType: "task",
      subjectId: taskId,
      version: (previous?.version ?? 0) + 1,
      body: result.script,
      validation: { ok: result.issues.length === 0, issues: result.issues },
      attempts: result.attempts,
      model: result.model,
    })
    .returning({ id: scripts.id });
  log.info(
    { taskId, pr: task.prNumber, attempts: result.attempts, issues: result.issues.length },
    "script written",
  );
  return { scriptId: row!.id, ...result };
}

// ------------------------------------------------------------------ capture

/** Before/after screenshots for UI changes. Never blocks review: failures are logged and skipped. */
export async function captureTask(taskId: string) {
  const { task } = await loadTask(taskId);
  const db = getDb();
  const repo = await db.query.repos.findFirst({ where: eq(repos.id, task.repoId) });
  if (!repo || !task.baseSha || !task.headSha) return { shots: 0 };
  await setTaskStatus(taskId, "ingesting", {
    progress: 0.15,
    detail: "Capturing before and after screenshots",
  });
  try {
    const { octokit } = await repoOctokit(repo.fullName, repo.installationId);
    const { token } = (await octokit.auth({ type: "installation" })) as { token: string };
    const outDir = ensureDir(dataDir("shots", taskId));
    const started = Date.now();
    const shots = await captureBeforeAfter({
      repoFullName: repo.fullName,
      baseSha: task.baseSha,
      headSha: task.headSha,
      token,
      outDir,
    });
    const expiresAt = expiryDate(repo.settings);
    for (const s of shots) {
      const ref = refs.shot(s.label, s.variant);
      const payload = {
        kind: "screenshot" as const,
        label: s.label,
        variant: s.variant,
        width: s.width,
        height: s.height,
        highlight: s.highlight,
      };
      await db
        .insert(evidenceTable)
        .values({
          taskId,
          ref,
          kind: "screenshot",
          title: `${s.label} (${s.variant})`,
          payload,
          blobPath: s.path,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [evidenceTable.taskId, evidenceTable.ref],
          set: { payload, blobPath: s.path, expiresAt },
        });
    }
    log.info(
      { taskId, pr: task.prNumber, shots: shots.length, ms: Date.now() - started },
      "screenshots captured",
    );
    return { shots: shots.length };
  } catch (err) {
    log.warn(
      { taskId, err: String(err).slice(0, 300) },
      "screenshot capture failed; continuing without screenshots",
    );
    return { shots: 0 };
  }
}

// ------------------------------------------------------------------ render

let assetServer: AssetServer | null = null;
/** One local asset server per worker, shared by task and digest renders. */
export async function assets(): Promise<AssetServer> {
  if (!assetServer) {
    assetServer = new AssetServer(dataDir());
    await assetServer.start();
  }
  return assetServer;
}

/** Voices the latest script and renders the task video. */
export async function renderTask(taskId: string) {
  const { task, evidence } = await loadTask(taskId);
  const db = getDb();
  const script = await db.query.scripts.findFirst({
    where: eq(scripts.subjectId, taskId),
    orderBy: desc(scripts.version),
  });
  if (!script) throw new Error(`Task ${taskId} has no script`);
  const triage = await db.query.triageResults.findFirst({
    where: eq(triageResults.taskId, taskId),
    orderBy: desc(triageResults.createdAt),
  });
  const repo = await db.query.repos.findFirst({ where: eq(repos.id, task.repoId) });
  const expiresAt = expiryDate(repo?.settings ?? DEFAULT_SETTINGS);

  const [render] = await db
    .insert(renders)
    .values({
      subjectType: "task",
      subjectId: taskId,
      scriptId: script.id,
      status: "voicing",
      expiresAt,
    })
    .returning({ id: renders.id });
  const renderId = render!.id;
  const outDir = ensureDir(dataDir("renders", taskId, renderId));
  const update = async (
    values: Partial<typeof renders.$inferInsert>,
    taskProgress?: number,
    detail?: string,
  ) => {
    if (Object.keys(values).length)
      await db.update(renders).set(values).where(eq(renders.id, renderId));
    if (taskProgress !== undefined)
      await setTaskStatus(taskId, "rendering", { progress: taskProgress, detail });
  };

  try {
    await update({}, 0.62, "Recording the narration");
    const body = script.body as TaskScript;
    const voice = await buildVoiceover(body, task.agent, outDir, (d, n) => {
      void update({ progress: (d / n) * 0.25 });
    });
    const server = await assets();
    const props = await buildTaskVideoProps({
      task,
      script: body,
      timeline: voice.timeline,
      evidence,
      route: triage?.route ?? null,
      defectRefs: (triage?.suspectedDefects ?? []).flatMap((d) => d.refs),
      audioSrc: server.url(voice.audioPath),
      assetUrl: (p) => server.url(p),
    });
    await update({ status: "rendering", progress: 0.25 }, 0.7, "Rendering the video");
    let lastTick = 0;
    const result = await renderTaskVideo(props, outDir, (p) => {
      const now = Date.now();
      if (now - lastTick < 1000) return;
      lastTick = now;
      void update(
        { progress: 0.25 + p * 0.75 },
        0.7 + p * 0.29,
        `Rendering the video (${Math.round(p * 100)}%)`,
      );
    });
    const vtt = toWebVtt(voice.timeline, (a) => PERSONAS[a].name);
    writeFileSync(join(outDir, "captions.vtt"), vtt);
    writeFileSync(join(outDir, "timeline.json"), JSON.stringify(voice.timeline));
    await update({
      status: "ready",
      progress: 1,
      videoPath: result.videoPath,
      posterPath: result.posterPath,
      timeline: voice.timeline,
      captionsVtt: vtt,
      durationMs: result.durationMs,
    });
    await setTaskStatus(taskId, task.status === "decided" ? "decided" : "ready", {
      progress: 1,
      detail: null,
    });
    log.info(
      {
        taskId,
        pr: task.prNumber,
        renderId,
        seconds: result.durationMs / 1000,
        renderMs: result.renderMs,
      },
      "video ready",
    );
    return { renderId, ...result };
  } catch (err) {
    await update({ status: "failed", error: String(err).slice(0, 2000) });
    await setTaskStatus(taskId, "failed", { progress: 1, detail: "Video render failed" });
    throw err;
  }
}
