/**
 * Turns narration written for the eye into text for the ear: operators and code
 * punctuation become words. Captions keep the written form.
 */
const RULES: [RegExp, string][] = [
  [/!==/g, " is not "],
  [/===/g, " equals "],
  [/!=/g, " is not "],
  [/==/g, " equals "],
  [/>=/g, " greater than or equal to "],
  [/<=/g, " less than or equal to "],
  [/=>/g, " arrow "],
  [/&&/g, " and "],
  [/\|\|/g, " or "],
  [/(\s)>(?=[\s,.;:)])/g, "$1greater than"],
  [/(\s)<(?=[\s,.;:)])/g, "$1less than"],
  [/(\w)\.(skip|only|todo)\b/g, "$1 dot $2"],
  [/`/g, ""],
  [/\bCI\b/g, "C.I."],
  [/\bPR\b/g, "P.R."],
  [/#(\d+)/g, "number $1"],
  [/\s{2,}/g, " "],
];

export function toSpeech(text: string): string {
  let out = ` ${text} `;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out.trim();
}
