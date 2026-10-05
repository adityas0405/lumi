import { tokens } from "@lumi/core";

export const C = tokens.color;

export const F = {
  sans: '"Red Hat Text", system-ui, sans-serif',
  mono: '"Red Hat Mono", ui-monospace, monospace',
};

/** Headlines, captions and big numbers: Red Hat Text at medium weight. */
export const DISPLAY = { fontFamily: F.sans, fontWeight: 500 } as const;

/** Layout grid for 1920×1080. */
export const G = {
  padX: 96,
  top: 84,
  stageTop: 236,
  stageBottom: 800,
  captionTop: 850,
};
