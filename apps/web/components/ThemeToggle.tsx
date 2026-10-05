"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "dark" | "light";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem("lumi-theme") as Theme) ?? "system");
    } catch {}
  }, []);
  const next: Record<Theme, Theme> = { system: "dark", dark: "light", light: "system" };
  return (
    <button
      type="button"
      className="text-xs text-stone hover:text-text"
      onClick={() => {
        const t = next[theme];
        setTheme(t);
        try {
          if (t === "system") {
            localStorage.removeItem("lumi-theme");
            delete document.documentElement.dataset.theme;
          } else {
            localStorage.setItem("lumi-theme", t);
            document.documentElement.dataset.theme = t;
          }
        } catch {}
      }}
      aria-label="Change theme"
    >
      Theme: {theme}
    </button>
  );
}
