import { C } from "../theme";

/**
 * Text that lights up as it is spoken. Display words are lit in proportion to
 * spoken words, since the spoken form can differ slightly from the written one.
 */
export function Words({
  text,
  fraction,
  lit = C.paper,
  unlit = C.dust,
}: {
  text: string;
  fraction: number;
  lit?: string;
  unlit?: string;
}) {
  const words = text.split(/(\s+)/);
  const total = words.filter((w) => w.trim()).length;
  const litCount = Math.round(fraction * total);
  let seen = 0;
  return (
    <>
      {words.map((w, i) => {
        if (!w.trim()) return w;
        seen += 1;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: word order is the identity
          <span key={i} style={{ color: seen <= litCount ? lit : unlit, transition: "none" }}>
            {w}
          </span>
        );
      })}
    </>
  );
}
