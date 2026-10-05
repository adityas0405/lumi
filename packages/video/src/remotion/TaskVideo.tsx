import type { SceneType, TimelineSentence } from "@lumi/core";
import { moduleOf, parseRef } from "@lumi/core";
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { TaskVideoProps } from "../props";
import { Caption, Header, Source } from "./chrome/Chrome";
import { diffRanges, hunkFor } from "./refs";
import { CodeScene, DecisionLogScene, ModuleMapScene, RequestScene } from "./scenes/ContextScenes";
import { DiffScene } from "./scenes/DiffScene";
import {
  BeforeAfterScene,
  CiScene,
  ClaimScene,
  DecisionScene,
  FilesScene,
  ScreenshotScene,
  TestsScene,
  TitleCard,
  UncertainScene,
} from "./scenes/Scenes";
import { C } from "./theme";
import { type Segment, segmentsOf, TEXT_SCENES } from "./timing";
import "./fonts";

function currentSentence(segment: Segment, ms: number): TimelineSentence {
  return (
    [...segment.sentences].reverse().find((s) => s.startMs - 250 <= ms) ?? segment.sentences[0]!
  );
}

/** Picks what to show; falls back gracefully when the cited evidence has no visual. */
function Scene({ segment, props, ms }: { segment: Segment; props: TaskVideoProps; ms: number }) {
  const sentence = currentSentence(segment, ms);
  const firstDiff =
    sentence.refs.find((r) => r.startsWith("diff:")) ??
    segment.sentences.flatMap((s) => s.refs).find((r) => r.startsWith("diff:"));
  const hunk = firstDiff ? hunkFor(props.hunks, firstDiff) : null;
  // Only pinpointed citations mark lines as defects; broad ones would paint whole blocks.
  const defectRanges = diffRanges(props.defectRefs).filter((r) => r.end - r.start < 12);
  const scene: SceneType = segment.scene;

  const diff = () =>
    hunk ? (
      <DiffScene hunk={hunk} sentences={segment.sentences} ms={ms} defectRanges={defectRanges} />
    ) : (
      <FilesScene files={props.files} />
    );
  // A logged decision is shown as the agent recorded it, wherever it's cited.
  const decisionRef = sentence.refs.find((r) => r.startsWith("decision:"));
  const decision = decisionRef ? props.decisions.find((d) => d.ref === decisionRef) : undefined;
  if (decision && scene !== "decision" && scene !== "map") {
    return (
      <DecisionLogScene
        decision={decision}
        agentName={props.meta.agentName}
        agentColor={props.meta.agentColor}
      />
    );
  }
  const codeRef = sentence.refs.map(parseRef).find((p) => p?.type === "code");
  const codeScene = () => {
    if (codeRef?.type !== "code") return null;
    const code = props.code.find(
      (c) =>
        c.path === codeRef.path &&
        codeRef.start >= c.startLine &&
        codeRef.start < c.startLine + c.lines.length,
    );
    return code ? (
      <CodeScene code={code} range={{ start: codeRef.start, end: codeRef.end }} />
    ) : null;
  };

  switch (scene) {
    case "map": {
      if (!props.map) return <FilesScene files={props.files} />;
      const focus = new Set(
        sentence.refs
          .map(parseRef)
          .flatMap((p) =>
            p && (p.type === "diff" || p.type === "code" || p.type === "file")
              ? [moduleOf(p.path)]
              : [],
          ),
      );
      return <ModuleMapScene map={props.map} focus={focus} ms={ms} startMs={segment.startMs} />;
    }
    case "task": {
      const request =
        props.requests.find((r) => sentence.refs.includes(r.ref)) ?? props.requests[0];
      return request ? <RequestScene request={request} /> : <FilesScene files={props.files} />;
    }
    case "diff":
      return hunk ? diff() : (codeScene() ?? diff());
    case "before_after":
      return <BeforeAfterScene hunk={hunk} sentence={sentence} shots={props.shots} />;
    case "tests":
      return props.tests.length ? (
        <TestsScene tests={props.tests} cited={sentence.refs} />
      ) : (
        <CiScene ci={props.ci} testSummary={props.meta.testSummary} />
      );
    case "ci":
      return <CiScene ci={props.ci} testSummary={props.meta.testSummary} />;
    case "claim":
      // Only the agent's own words get the pull-quote treatment; narrator commentary
      // about its description is a note, so nothing is misattributed.
      return sentence.attributedToAgent ? (
        <ClaimScene sentence={sentence} ms={ms} meta={props.meta} />
      ) : (
        <UncertainScene
          sentence={sentence}
          ms={ms}
          label={`On ${props.meta.agentName}'s description`}
          tone="stone"
        />
      );
    case "uncertain":
      return <UncertainScene sentence={sentence} ms={ms} />;
    case "decision":
      return (
        <DecisionScene meta={props.meta} ms={ms} sentenceStart={segment.sentences[0]!.startMs} />
      );
    case "screenshot": {
      const shot =
        props.shots.find((s) => sentence.refs.includes(s.ref)) ??
        props.shots.find((s) => s.variant !== "before");
      return shot ? <ScreenshotScene shot={shot} /> : diff();
    }
    case "files":
    case "chart":
    case "title":
      return <FilesScene files={props.files} />;
    default:
      return diff();
  }
}

export function TaskVideo(props: TaskVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { timeline } = props;
  const segments = segmentsOf(timeline);
  const segment = [...segments].reverse().find((s) => s.startMs <= ms) ?? null;
  const sentence = segment ? currentSentence(segment, ms) : null;

  const titleOpacity = interpolate(ms, [timeline.leadInMs - 700, timeline.leadInMs - 200], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bodyOpacity = interpolate(ms, [timeline.leadInMs - 450, timeline.leadInMs], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sceneIn = segment
    ? interpolate(ms, [segment.startMs, segment.startMs + 280], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
      <Audio src={props.audioSrc} />
      {titleOpacity > 0 && (
        <AbsoluteFill style={{ opacity: titleOpacity }}>
          <TitleCard meta={props.meta} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ opacity: bodyOpacity }}>
        <Header meta={props.meta} timeline={timeline} ms={ms} />
        {segment && (
          <div style={{ opacity: sceneIn, transform: `translateY(${(1 - sceneIn) * 14}px)` }}>
            <Scene segment={segment} props={props} ms={ms} />
          </div>
        )}
        <Caption sentence={sentence} ms={ms} hidden={!segment || TEXT_SCENES.has(segment.scene)} />
        <Source sentence={sentence} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
