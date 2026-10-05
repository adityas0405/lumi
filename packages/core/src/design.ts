/**
 * Lumi's editorial design tokens, shared by the video renderer and the review app.
 * Structure comes from type, hairlines and spacing; type is Red Hat Text and Red Hat Mono. Oxide is the only loud colour
 * (problems); ochre marks uncertainty. Design rules: DECISIONS.md, "Design for power users".
 */
export const tokens = {
  color: {
    ink: "#0f0e0c",
    ink2: "#161512",
    rule: "#2a2824",
    paper: "#ebe6da",
    paperDim: "#d6d0c3",
    stone: "#a29c8f",
    dust: "#6d685e",
    oxide: "#c55d3c",
    ochre: "#bf9f5f",
    code: "#cbc5b8",
  },
  font: {
    sans: '"Red Hat Text", system-ui, sans-serif',
    mono: '"Red Hat Mono", ui-monospace, monospace',
  },
} as const;
