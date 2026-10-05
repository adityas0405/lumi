import { Composition } from "remotion";
import { type DigestVideoProps, FPS, HEIGHT, type TaskVideoProps, WIDTH } from "../props";
import { DigestVideo } from "./DigestVideo";
import { TaskVideo } from "./TaskVideo";

const empty: TaskVideoProps = {
  timeline: { version: 1, durationMs: 4000, leadInMs: 2600, chapters: [], sentences: [] },
  audioSrc: "",
  meta: {
    agentName: "Agent",
    agentColor: "#95a585",
    prNumber: null,
    title: "",
    headline: "",
    kicker: "Lumi review",
    route: null,
    checks: null,
    testSummary: null,
    changedLines: 0,
    fileCount: 0,
    recommendation: "approve",
    recommendationReason: "",
  },
  defectRefs: [],
  hunks: [],
  tests: [],
  ci: [],
  files: [],
  shots: [],
  requests: [],
  code: [],
  map: null,
  decisions: [],
};

const emptyDigest: DigestVideoProps = {
  timeline: { version: 1, durationMs: 4000, leadInMs: 2600, chapters: [], sentences: [] },
  audioSrc: "",
  meta: { dateLabel: "", repo: "", counts: { decisions: 0, problems: 0, done: 0 } },
  items: [],
  routine: [],
};

export function Root() {
  return (
    <>
      <Composition
        id="TaskVideo"
        component={TaskVideo}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={120}
        defaultProps={empty}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.timeline.durationMs / 1000) * FPS),
        })}
      />
      <Composition
        id="DigestVideo"
        component={DigestVideo}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={120}
        defaultProps={emptyDigest}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.ceil((props.timeline.durationMs / 1000) * FPS),
        })}
      />
    </>
  );
}
